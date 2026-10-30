"""Authored world layout shared with clients; existing landmark IDs stay stable."""
from .settlement import FACILITY_SPECS, SEARCH_SITES

SIZE = 544
LAYOUT_VERSION = 3
BASE_USE_RADIUS = 7.0
BASE_CLEAR_RADIUS = 9.0
START_BASE = (22, 22)
BASE_SPAWN_SITES = [
    (22, 22),   # 제1 야영지: 버려진 외곽 북서 캠프 (시작 기지)
    (14, 14),   # 제2 야영지: 버려진 외곽 서부 초원
    (28, 36),   # 제3 야영지: 버려진 외곽 남동 평원
    (58, 14),   # 제4 야영지: 잿빛 소나무숲 북서 기지
    (74, 14),   # 제5 야영지: 잿빛 소나무숲 북부 캠프
    (72, 38),   # 제6 야영지: 잿빛 소나무숲 오솔길 터
    (82, 56),   # 제7 야영지: 잿빛 소나무숲 남동 거점
    (84, 22),   # 제8 야영지: 잿빛 소나무숲 중앙 터
    (96, 14),   # 제9 야영지: 잿빛 소나무숲 동부 기지
    (102, 36),  # 제10 야영지: 잿빛 소나무숲 동남부 캠프
    (108, 22),  # 제11 야영지: 잿빛 소나무숲 심층 거점
]
MOVEMENT = {'step': .48, 'interval': .08, 'sprint_mult': 1.65, 'mount_base': 1.65, 'mount_tier': .20}
REGIONS = [
    {'id': 'outskirts', 'name': '버려진 외곽', 'subtitle': '저렙 지역 · 넓은 공터와 약한 감염체 출몰지',
     'x': 27, 'y': 26, 'radius': 47, 'color': '#565962'},
    {'id': 'forest', 'name': '잿빛 소나무숲', 'subtitle': '중저렙 지역 · 숲속 포식자가 배회하는 오솔길',
     'x': 86, 'y': 29, 'radius': 48, 'color': '#3c5550'},
    {'id': 'marsh', 'name': '안개 저지대', 'subtitle': '고렙 위험지역 · 맹독 변이체가 서성이는 늪지대',
     'x': 29, 'y': 91, 'radius': 49, 'color': '#48616e'},
    {'id': 'works', 'name': '침묵의 공업지대', 'subtitle': '최상위 고렙지역 · 보스급 철갑 파괴자의 황무지',
     'x': 94, 'y': 92, 'radius': 50, 'color': '#71616a'},
]
for region, levels in zip(REGIONS, [(1, 5), (1, 12), (13, 20), (21, 30)]):
    region['levels'] = list(levels)

ROADS = [
    [[9, 28], [24, 33], [40, 26], [56, 34], [73, 27], [89, 34], [115, 25]],
    [[25, 33], [32, 49], [24, 67], [32, 83], [27, 106], [38, 119]],
    [[32, 83], [49, 88], [65, 80], [83, 92], [106, 98], [119, 108]],
    [[89, 34], [82, 51], [93, 67], [83, 92]],
]
TOWNS = {
    'human': {
        'id': 'lumina',
        'name': '루미나 성채',
        'subtitle': '인간 연합 요새 마을 · 안전지대',
        'faction': 'human',
        'x': 18.0,
        'y': 18.0,
        'radius': 8.5,
        'color': '#38bdf8',
        'spawn': (18.0, 19.0),
        'merchant': {
            'id': 'merchant_human',
            'name': '루미나 보급 상인',
            'label': '루미나 보급 상인',
            'kind': 'merchant',
            'faction': 'human',
            'x': 14.0,
            'y': 16.0,
        }
    },
    'vampire': {
        'id': 'sanguis',
        'name': '생귀스 성채',
        'subtitle': '진홍빛 혈족 안식처 마을 · 안전지대',
        'faction': 'vampire',
        'x': 88.0,
        'y': 22.0,
        'radius': 8.5,
        'color': '#e11d48',
        'spawn': (88.0, 23.0),
        'merchant': {
            'id': 'merchant_vampire',
            'name': '암시장 밀거래 상인',
            'label': '암시장 밀거래 상인',
            'kind': 'merchant',
            'faction': 'vampire',
            'x': 84.0,
            'y': 20.0,
        }
    }
}
# Layout 3 doubles each axis: four times the explorable area.
START_BASE = tuple(v*2 for v in START_BASE)
BASE_SPAWN_SITES = [tuple(v*2 for v in site) for site in BASE_SPAWN_SITES]
for region in REGIONS:
    for key in ('x', 'y', 'radius'):
        region[key] *= 2
ROADS = [[[v*2 for v in point] for point in road] for road in ROADS]
for town in TOWNS.values():
    for key in ('x', 'y', 'radius'):
        town[key] *= 2
    town['spawn'] = tuple(v*2 for v in town['spawn'])
    town['merchant'].update(x=town['x']-8, y=town['y']-5)

MERCHANTS = []
for faction, town in TOWNS.items():
    town['merchant']['role'] = 'supplies'
    MERCHANTS.append(town['merchant'])
    for role, label, dx, dy in [('equipment', '장비 상인', 8, -5), ('scroll', '주문서 상인', -8, 6), ('skill', '스킬 상인', 8, 6)]:
        MERCHANTS.append({'id': f'{faction}_{role}', 'name': label, 'label': label,
                          'kind': 'merchant', 'role': role, 'faction': faction,
                          'x': town['x'] + dx, 'y': town['y'] + dy})
WORLD_MAP = {'size': SIZE, 'layout_version': LAYOUT_VERSION, 'regions': REGIONS, 'roads': ROADS,
             'movement': MOVEMENT, 'base_radius': BASE_USE_RADIUS, 'base_clear_radius': BASE_CLEAR_RADIUS,
             'towns': TOWNS, 'merchants': MERCHANTS}


def region_at(x, y):
    import math
    for starter in WORLD_MAP.get('starter_regions',[]):
        if math.hypot(x-starter['x'],y-starter['y'])<starter['radius']:return starter
    candidates = REGIONS[:4] if x < 256 and y < 256 else (REGIONS[4:9] or REGIONS[:4]) if x < 384 and y < 384 else (REGIONS[9:] or REGIONS[4:9] or REGIONS[:4])
    x, y = x + math.sin(y / 13) * 5, y + math.sin(x / 17) * 4
    return min(candidates, key=lambda r: ((x-r['x'])**2+(y-r['y'])**2)/r['radius']**2)


def expand_coordinate(value):
    return round(value * 1.65 + 12, 3)


POIS = [
    {'id': 'grove', 'x': 4, 'y': 8, 'label': '숲 · 목재', 'kind': 'wood'},
    {'id': 'well', 'x': 8, 'y': 4, 'label': '샘 · 식수', 'kind': 'water'},
    {'id': 'garden', 'x': 5, 'y': 13, 'label': '텃밭 · 작물', 'kind': 'crop'},
    {'id': 'herbs', 'x': 11, 'y': 5, 'label': '약초밭', 'kind': 'herb'},
    {'id': 'blood', 'x': 13, 'y': 13, 'label': '혈액 저장소', 'kind': 'blood'},
    {'id': 'scrap', 'x': 17, 'y': 8, 'label': '폐차장 · 부품', 'kind': 'metal'},
    {'id': 'human', 'x': 3, 'y': 17, 'label': '인간 보급관', 'kind': 'npc'},
    {'id': 'vampire', 'x': 18, 'y': 16, 'label': '혈족 연금사', 'kind': 'npc'},
]
_LANDMARKS = [
    ('ridge', 24, 12, '언덕 벌목지', 'wood'), ('orchard', 24, 25, '버려진 과수원', 'crop'),
    ('crossing', 28, 20, '길목 우물', 'water'), ('pine', 37, 9, '소나무 군락', 'wood'),
    ('spring', 43, 15, '숲속 샘', 'water'), ('forest-herbs', 36, 24, '그늘 약초밭', 'herb'),
    ('forest-crop', 52, 8, '산장 텃밭', 'crop'), ('lumber', 54, 24, '폐벌목장', 'wood'),
    ('ranger', 47, 23, '숲 보급관', 'npc'), ('reeds', 9, 39, '갈대 약초밭', 'herb'),
    ('cistern', 18, 37, '옛 집수장', 'water'), ('marsh-garden', 9, 51, '물가 경작지', 'crop'),
    ('driftwood', 25, 48, '침수 벌목장', 'wood'), ('marsh-blood', 23, 57, '야전 혈액고', 'blood'),
    ('ferryman', 16, 48, '저지대 연금사', 'npc'), ('depot', 38, 38, '폐철도 야적장', 'metal'),
    ('clinic', 46, 42, '폐병원 혈액고', 'blood'), ('foundry', 55, 52, '주조소 고철장', 'metal'),
    ('roof-garden', 39, 55, '공장 옥상 텃밭', 'crop'), ('reservoir', 55, 35, '공업용 정수장', 'water'),
    ('mechanic', 49, 56, '공업지대 보급관', 'npc'),
]
POIS += [dict(id=i, x=x, y=y, label=label, kind=kind) for i, x, y, label, kind in _LANDMARKS]
# Stable IDs, wider spacing. Starting resources sit beyond the camp clearing.
for node in POIS:
    node['x'], node['y'] = expand_coordinate(node['x']), expand_coordinate(node['y'])
_START_NODES = {'grove': (10, 26), 'well': (30, 12), 'garden': (17, 38),
                'herbs': (39, 20), 'blood': (36, 44), 'scrap': (52, 23),
                'human': (8, 43), 'vampire': (47, 43)}
for node in POIS:
    if node['id'] in _START_NODES:
        node['x'], node['y'] = _START_NODES[node['id']]
ENEMY_SPAWNS = [(42, 12), (54, 36), (25, 55), (59, 63), (72, 36), (112, 58),
                (12, 85), (49, 105), (81, 73), (106, 94), (111, 115)]

ENEMY_PROFILES = [
    {'faction': 'infected', 'name': '배회하는 감염자'},      # 0: (42, 12)  - outskirts
    {'faction': 'infected', 'name': '부패한 변이체'},        # 1: (54, 36)  - border
    {'faction': 'infected', 'name': '어둠의 혈마법사 변이체'},# 2: (25, 55)  - outskirts/marsh
    {'faction': 'infected', 'name': '심연의 배회자'},        # 3: (59, 63)  - central
    {'faction': 'human',    'name': '인간 토벌대 성기사'},    # 4: (72, 36)  - border (Human faction combatant)
    {'faction': 'vampire',  'name': '진홍빛 혈기사'},        # 5: (112, 58) - forest (Vampire faction combatant)
    {'faction': 'infected', 'name': '맹독 늪지 변이체'},    # 6: (12, 85)  - marsh
    {'faction': 'human',    'name': '빛의 결계 수호병'},      # 7: (49, 105) - marsh border (Human)
    {'faction': 'vampire',  'name': '심연의 혈족 장로'},      # 8: (81, 73)  - works border (Vampire)
    {'faction': 'human',    'name': '최후의 중장갑 토벌대원'}, # 9: (106, 94) - works (Human)
    {'faction': 'vampire',  'name': '밤의 혈족 암살자'},      # 10: (111, 115) - deep works (Vampire)
]


# Preserve landmark and encounter IDs; spread resources and existing patrols out.
for node in POIS:
    node['x'] *= 2
    node['y'] *= 2
ENEMY_SPAWNS = [(x*2, y*2) for x, y in ENEMY_SPAWNS]
MONSTER_TYPES = {
    'walker': {'name': '굶주린 감염자', 'scale': .95, 'hue': 0, 'speed': .8},
    'hound': {'name': '묘지 사냥귀', 'scale': .8, 'hue': 35, 'speed': 1.25},
    'plague': {'name': '역병 운반자', 'scale': 1.05, 'hue': 80, 'speed': .7},
    'wraith': {'name': '잿빛 망령', 'scale': .95, 'hue': 190, 'speed': 1.05},
    'juggernaut': {'name': '철갑 도살자', 'scale': 1.25, 'hue': 320, 'speed': .6},
    'knight': {'name': '혈월의 집행자', 'scale': 1.15, 'hue': 0, 'speed': .9},
}
# Hand-authored hunting pockets, with generous travel space between them.
_EXTRA_SPAWNS = [(25,72),(66,30),(64,78),(20,108),(86,94),(112,36),
                 (162,90),(182,76),(214,28),(238,82),(146,110),(208,106),
                 (22,148),(62,146),(92,176),(30,196),(68,236),(120,234),
                 (144,132),(196,146),(238,162),(150,204),(184,240),(238,244)]
for offset, position in enumerate(_EXTRA_SPAWNS):
    kind = list(MONSTER_TYPES)[offset % len(MONSTER_TYPES)]
    faction = ('human' if (offset//6) % 2 else 'vampire') if kind == 'knight' else 'infected'
    ENEMY_SPAWNS.append(position)
    profile = {'faction': faction, 'name': MONSTER_TYPES[kind]['name'], 'monster_type': kind}
    if offset == 23:
        profile['level'] = 30
    ENEMY_PROFILES.append(profile)
WORLD_MAP['monster_types'] = MONSTER_TYPES

WORLD_MAP['facilities'] = FACILITY_SPECS
# Deterministic, spaced scavenging landmarks: 12 types in each region.
import math
_candidates = [(x+math.sin(y)*3, y+math.cos(x)*3) for x in range(14,248,18) for y in range(14,248,18)]
_candidates.sort(key=lambda xy: math.sin(xy[0]*12.3+xy[1]*7.1))
for region in REGIONS:
    placed = 0
    for x,y in _candidates:
        if placed == 12:
            break
        if region_at(x,y)['id'] != region['id']:
            continue
        if any(math.hypot(x-t['x'],y-t['y']) < t['radius']+6 for t in TOWNS.values()):
            continue
        if any(math.hypot(x-n['x'],y-n['y']) < 9 for n in POIS) or any(math.hypot(x-ex,y-ey)<7 for ex,ey in ENEMY_SPAWNS):
            continue
        kind = list(SEARCH_SITES)[placed]
        label, prop, loot, seconds = SEARCH_SITES[kind]
        POIS.append(dict(id='search:'+region['id']+':'+kind,x=round(x,2),y=round(y,2),kind='metal',site_type=kind,prop=prop,label=label,loot=loot,seconds=seconds))
        placed += 1


# Expansion is additive: preserve every original position and layout migration.
from . import frontier
REGIONS.extend(frontier.REGIONS)
MONSTER_TYPES.update(frontier.MONSTER_TYPES)
WORLD_MAP['max_combat_level'] = frontier.MAX_COMBAT_LEVEL
WORLD_MAP['materials'] = {**frontier.MATERIALS}
ROADS.extend([
    [[230,52],[270,58],[318,42],[356,85],[326,184],[348,245],[321,321]],
    [[54,230],[60,271],[43,320],[118,344],[190,313],[254,342],[321,321]],
    [[221,190],[265,205],[320,184]],
])
for zone_index, region in enumerate(frontier.REGIONS):
    for index,(dx,dy) in enumerate([(x,y) for y in (-44,0,44) for x in (-48,-16,16,48)]):
        kind=frontier.MONSTER_POOLS[zone_index][index%4]
        level=region['levels'][0]+round(index/11*(region['levels'][1]-region['levels'][0]))
        ENEMY_SPAWNS.append((round(region['x']+dx+math.sin(index*2.4+zone_index)*4,2),round(region['y']+dy+math.cos(index*1.8+zone_index)*4,2)))
        ENEMY_PROFILES.append(dict(faction='infected',name=MONSTER_TYPES[kind]['name'],monster_type=kind,level=level))
# 20 spaced search points in each new region; old 48 search points stay fixed.
_candidates=[(x+math.sin(y)*2,y+math.cos(x)*2) for x in range(12,384-8,14) for y in range(12,384-8,14) if x>=262 or y>=262]
_candidates.sort(key=lambda xy: math.sin(xy[0]*12.3+xy[1]*7.1))
for region in frontier.REGIONS:
    allowed=[kind for kind in SEARCH_SITES if frontier.SITE_LEVELS.get(kind,1)<=region['levels'][0]]
    kinds=(allowed+allowed)[:20]
    used={}
    for x,y in _candidates:
        if not kinds: break
        if region_at(x,y)['id']!=region['id']: continue
        if any(math.hypot(x-n['x'],y-n['y'])<10 for n in POIS): continue
        if any(math.hypot(x-ex,y-ey)<8 for ex,ey in ENEMY_SPAWNS): continue
        kind=kinds.pop(0);label,prop,loot,seconds=SEARCH_SITES[kind]
        used[kind]=used.get(kind,0)+1
        suffix='' if used[kind]==1 else ':'+str(used[kind])
        POIS.append(dict(id='search:'+region['id']+':'+kind+suffix,x=round(x,2),y=round(y,2),kind='metal',site_type=kind,prop=prop,label=label,loot=loot,seconds=seconds))


from . import warfront
REGIONS.extend(warfront.REGIONS)
WORLD_MAP['facility_themes']=warfront.FACILITY_THEMES
WORLD_MAP['id']='field'
WORLD_MAP['art_version']=2
ROADS.extend([[[350,70],[400,100],[468,75],[480,245],[461,440]],[[70,350],[99,400],[80,467],[242,475],[360,458],[470,500]]])
for zone,region in enumerate(warfront.REGIONS):
    for index,(dx,dy) in enumerate([(-42,-45),(6,-49),(46,-28),(-38,4),(12,0),(48,30),(-27,47),(18,49)]):
        x,y=region['x']+dx+math.sin(index+zone)*3,region['y']+dy+math.cos(index*2+zone)*3
        # Narrow southern connector keeps patrols outside neighboring pockets.
        if region['id']=='bloodroad':x=region['x']+dx*.45
        level=region['levels'][0]+round(index/7*(region['levels'][1]-region['levels'][0]))
        kind=list(MONSTER_TYPES)[(zone*3+index)%len(MONSTER_TYPES)]
        ENEMY_SPAWNS.append((round(x,2),round(y,2)))
        ENEMY_PROFILES.append(dict(faction='infected',name=MONSTER_TYPES[kind]['name'],monster_type=kind,level=level))
_candidates=[(x+math.sin(y)*3,y+math.cos(x)*3) for x in range(14,SIZE-8,18) for y in range(14,SIZE-8,18) if x>=390 or y>=390]
_candidates.sort(key=lambda xy:math.sin(xy[0]*12.3+xy[1]*7.1))
for region in warfront.REGIONS:
    kinds=[k for k in SEARCH_SITES if frontier.SITE_LEVELS.get(k,1)<=region['levels'][0]][:12]
    for x,y in _candidates:
        if not kinds:break
        if region_at(x,y)['id']!=region['id']:continue
        if any(math.hypot(x-n['x'],y-n['y'])<10 for n in POIS):continue
        if any(math.hypot(x-ex,y-ey)<8 for ex,ey in ENEMY_SPAWNS):continue
        kind=kinds.pop(0);label,prop,loot,seconds=SEARCH_SITES[kind]
        POIS.append(dict(id='search:'+region['id']+':'+kind,x=round(x,2),y=round(y,2),kind='metal',site_type=kind,prop=prop,label=label,loot=loot,seconds=seconds))


# Relocate after generation so unrelated authored landmarks keep their coordinates.
TOWNS['vampire'].update(x=518.0, y=44.0, spawn=(518.0,46.0))
for merchant in MERCHANTS:
    if merchant['faction']=='vampire':merchant['x']+=342
for node in POIS:
    if node['id']=='vampire':node.update(x=518.0,y=57.0)
ENEMY_SPAWNS[97]=(514.0,82.0)  # Keep patrols beyond the new walls.
VAMPIRE_STARTER=dict(id='vampire_outskirts',name='생귀스 외곽',subtitle='혈족 초보 사냥터',x=518,y=44,radius=48,levels=[1,5],color='#51445c',terrain='forest')
WORLD_MAP['starter_regions']=[VAMPIRE_STARTER]
ROADS.append([[518,61],[514,82],[474,80]])


def migrate_town_profile(profile):
    player=profile.get('player',{})
    if player.get('town_revision',1)>=2:return profile
    # Move visitors only. Personal estates and outfield characters retain position.
    for actor,xx,yy in [(player,'x','y'),(player.get('dungeon',{}),'return_x','return_y')]:
        if actor.get(xx) is not None and actor.get(yy) is not None and math.hypot(actor[xx]-176,actor[yy]-44)<=17:
            if actor is player and player.get('dungeon'):continue
            actor[xx]+=342
    player['town_revision']=2
    return profile


def migrate_town_world(world):
    migrate_town_profile(world)
    if world.get('town_revision',1)>=2:return
    for npc in world.get('npcs',[]):
        if npc['id']=='vampire':npc.update(x=518.0,y=57.0,home_x=518.0,home_y=57.0)
    for enemy in world.get('enemies',[]):
        if enemy['id'] in (96,97):
            fresh=new_enemy(enemy['id'])
            fresh['hp']=round(fresh['max_hp']*min(1,enemy['hp']/max(1,enemy['max_hp'])))
            fresh['respawn']=enemy.get('respawn',0)
            enemy.update(fresh)
    world['town_revision']=2

def migrate_profile_layout(profile, source_layout=None):
    """Move personal coordinates once; keep all equipment, resources and facilities."""
    player = profile.get('player', {})
    version = source_layout if source_layout is not None else player.get('map_layout', 2)
    if version not in (1, 2, LAYOUT_VERSION):
        raise ValueError('Unsupported personal map layout')
    if version < LAYOUT_VERSION:
        for actor in (player, profile.get('base', {})):
            for key in ('x', 'y'):
                if actor.get(key) is not None:
                    actor[key] = (expand_coordinate(actor[key]) if version == 1 else actor[key])*2
    player['map_layout'] = LAYOUT_VERSION
    return migrate_town_profile(profile)


def new_enemy(index):
    x, y = ENEMY_SPAWNS[index]
    region = region_at(x, y)
    prof = ENEMY_PROFILES[index % len(ENEMY_PROFILES)]
    level = prof.get('level', region['levels'][0] + index % (region['levels'][1]-region['levels'][0]+1))
    # Both starter towns have low-level hunting pockets outside their walls.
    starter = min(((x-t['x'])**2+(y-t['y'])**2)**.5 for t in TOWNS.values()) < 48
    if starter:
        level = 1 + index % 5
    tier_mult = {'outskirts': 1, 'forest': 2, 'marsh': 4, 'works': 7}.get(region['id'], 7)
    hp = 60 + (level-1)*18*tier_mult
    damage = 8 + (level-1)*(2 if region['id'] == 'outskirts' else 4)
    monster = MONSTER_TYPES.get(prof.get('monster_type'), {})
    if region.get('terrain') and not starter:
        hp = round((1500 + level*55) * monster.get('hp_mult', 1))
        damage = round((15 + level*3.5) * monster.get('damage_mult', 1))
    if starter:
        hp=60+(level-1)*18
        damage=8+(level-1)*2
        tier_mult=1
    faction = prof['faction']
    name = prof['name']
    return {'id': index, 'x': x, 'y': y, 'hp': hp, 'max_hp': hp, 'level': level,
            'name': name, 'region': region['id'], 'damage': damage, 'faction': faction,
            'monster_type': prof.get('monster_type', 'juggernaut' if level >= 13 else 'walker'),
            'materials': {monster['material']: 1+level//40} if monster.get('material') else {},
            'xp': 12+level*4*tier_mult, 'respawn': 0, 'attack': 0, 'returning': False}


def new_npcs():
    return [dict(n, home_x=n['x'], home_y=n['y']) for n in POIS if n['kind'] == 'npc']


def live_pois(world):
    moving = {n['id']: n for n in world['npcs']}
    base = world.get('base', {})
    def outside_base(node):
        return not (node.get('site_type') and base.get('established', True) and base.get('x') is not None and math.hypot(node['x']-base['x'], node['y']-base['y']) < 12)
    return [moving.get(n['id'], n) for n in POIS if outside_base(n)]
