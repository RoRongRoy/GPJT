"""Private expedition state. Calendar and quota persistence are supplied by Runtime."""
import math
from datetime import datetime, timedelta, timezone

DUNGEONS = {
    'bunker':dict(name='봉쇄된 지하 보급고',level=10,limit=3,theme='human',reward={'gold':100,'silver':4,'leather':4}),
    'crypt':dict(name='혈족의 잊힌 납골당',level=35,limit=2,theme='vampire',reward={'gold':250,'crystal':4,'mutagen':4}),
    'abyss':dict(name='혈월의 봉인 성채',level=70,limit=1,theme='vampire',reward={'gold':500,'ancient_core':3,'obsidian':5}),
}
DUNGEON_SIZE = 64
DURATION = 1200


def calendar_day(now=None):
    return (now or datetime.now(timezone.utc)).astimezone(timezone(timedelta(hours=9))).date().isoformat()


def current(profile):
    return profile['player'].get('dungeon')


def view(world, profile=None):
    prof=profile or world
    result={**world,**prof}
    instance=current(prof)
    if instance:
        result.update(enemies=instance['enemies'],drops=instance['drops'],npcs=[],
                      base={'x':None,'y':None,'established':False,'facilities':{}},
                      _dungeon_view=True)
    return result


def enter(world, key):
    from .game import require, note
    p=world['player'];spec=DUNGEONS.get(key) if isinstance(key,str) else None
    require(spec, '알 수 없는 던전입니다.')
    require(p.get('chosen') and not current(world), '필드에서 캐릭터를 선택한 뒤 입장하세요.')
    require(not world['paused'], '일시정지를 해제하세요.')
    require(p.get('combat_level',1)>=spec['level'], f"전투 Lv.{spec['level']} 이상 입장할 수 있습니다.")
    require(p['hp']>0 and not p.get('mounted'), '살아 있는 상태에서 하차 후 입장하세요.')
    enemies=[]
    for i,(x,y) in enumerate([(16,13),(25,17),(37,13),(48,23),(20,33),(34,40),(48,49)]):
        level=spec['level']+(i//2)
        boss=i==6
        hp=(70+level*22)*(3 if boss else 1)
        enemies.append(dict(id=i,x=x,y=y,home_x=x,home_y=y,hp=hp,max_hp=hp,level=level,
            name=(spec['name']+' · 봉인 수호자') if boss else ('탈주 실험체' if spec['theme']=='human' else '납골당 파수꾼'),
            faction='infected',monster_type='juggernaut' if boss else 'wraith',damage=8+level*2,
            xp=40+level*15,respawn=0,attack=0,returning=False,materials={'bone':2} if not boss else {'crystal':3}))
    p['dungeon']=dict(id=key,storage_level=world['base']['facilities'].get('storage',0) if world['base'].get('established',True) else 0,return_x=p['x'],return_y=p['y'],remaining=DURATION,enemies=enemies,drops=[],cleared=False)
    p.update(x=7.,y=7.,mounted=False)
    note(world, spec['name']+' 입장 · 모든 적을 처치한 뒤 보상을 수령하세요.')


def leave(world, reason='던전에서 귀환했습니다.'):
    from .game import note
    instance=current(world)
    if not instance:return
    p=world['player'];p.update(x=instance['return_x'],y=instance['return_y'],mounted=False)
    p.pop('dungeon',None);note(world,reason)


def claim(world):
    from .game import require, note, bag_used, bag_capacity
    instance=current(world)
    require(instance and not instance['cleared'], '수령할 던전 보상이 없습니다.')
    require(all(e['hp']<=0 for e in instance['enemies']), '던전의 모든 적을 처치하세요.')
    reward=DUNGEONS[instance['id']]['reward']
    require(bag_used(world)+sum(v for k,v in reward.items() if k!='gold')<=bag_capacity(world), '가방 공간을 비운 뒤 보상을 수령하세요.')
    for key,amount in reward.items():world['inventory'][key]=world['inventory'].get(key,0)+amount
    instance['cleared']=True;note(world,'던전 완료 보상을 수령했습니다. 귀환 전에 남은 전리품을 회수하세요.')


def tick_instance(world, prof, dt):
    from .game import _tick_actor, armor_power, move_toward, dist
    instance=current(prof)
    if not instance:return
    _tick_actor(world,prof,dt)
    instance['remaining']=max(0,instance['remaining']-dt)
    p=prof['player']
    for e in instance['enemies']:
        if e['hp']<=0 or e.get('stunned_until',0)>world['elapsed']:continue
        distance=dist(e,p)
        if distance<9:
            if distance>1.2:move_toward(e,p,dt*.95)
            if distance<=1.5 and world['elapsed']>=e['attack']:
                e['attack']=world['elapsed']+2.2
                p['hp']=max(0,p['hp']-max(1,e['damage']-armor_power(prof)-(p.get('combat_level',1)-1)//2))
        else:
            home={'x':e['home_x']+math.sin(world['elapsed']*.15+e['id'])*2,'y':e['home_y']+math.cos(world['elapsed']*.15+e['id'])*2}
            move_toward(e,home,dt*.45)
    if p['hp']<=0 or p['infection']>=100:
        p.update(hp=65.,infection=0.)
        leave(prof,'전투 불능 · 던전에서 귀환했습니다. 입장 횟수는 반환되지 않습니다.')
    elif instance['remaining']<=0:leave(prof,'던전 제한 시간이 끝나 귀환했습니다.')


def map_for(instance, field_map):
    spec=DUNGEONS[instance['id']]
    return {**field_map,'id':'dungeon:'+instance['id'],'size':DUNGEON_SIZE,
            'layout_version':'dungeon:'+instance['id'],'towns':{},'merchants':[],
            'regions':[dict(id='instance',name=spec['name'],subtitle='개인 던전 · 20분 · 전원 처치 후 보상 수령',
                            x=32,y=32,radius=50,color='#453b48',terrain='works' if spec['theme']=='human' else 'marsh',levels=[spec['level'],spec['level']+3])],
            'roads':[[[7,7],[19,14],[40,17],[48,30],[34,40],[48,49]]], 'dungeon_theme':spec['theme']}
