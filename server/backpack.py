"""Shared, deterministic rectangle packing. Equipped gear never occupies the bag."""
from .equipment import BACKPACK_TIERS

GEAR_SHAPES={'weapon':(2,3),'armor':(3,3),'pants':(2,2),'boots':(2,2),
             'gloves':(1,2),'necklace':(1,1),'ring':(1,1),'backpack':(3,3)}
BULKY={'motor','pump','generator_rotor','engine_block','ancient_core'}
WIDE={'wood','plank','rebar','copper_pipe','iron_mesh','canvas','solar_panel','steel_beam'}
MEDIUM={'metal','ore','stone','brick','cement','rubber','fuel','battery','filter','insulation',
        'weapon_core','armor_plate','ceramic','gothic_stone','slate','radiator','optical_array',
        'hardened_hide','chitin_plate','blood_crystal','relic_fragment'}
TALL={'water','blood','chemicals','antiseptic','culture','glass','wire','rope','binding',
      'cloth','herb','crop','fertilizer','resin','leather','bone','silver','sulfur','crystal',
      'mutagen','obsidian','alloy','thread','essence','blessed_ink','iron_fragment',
      'arcane_dust','spirit_fiber','blood_pearl','treated_timber','cured_hide','circuit_board'}
def item_spec(key,gear=None):
    if gear:
        dims=gear.get('shape') or GEAR_SHAPES.get(gear.get('slot'),(1,1))
        return dict(w=dims[0],h=dims[1],stack=1)
    dims=(3,3) if key in BULKY else (3,2) if key in WIDE else (2,2) if key in MEDIUM else (1,2) if key in TALL or key.startswith('skillbook') else (1,1)
    stack=1 if key.startswith('skillbook') else 5 if key in BULKY else 10 if key in WIDE|MEDIUM else 20
    return dict(w=dims[0],h=dims[1],stack=stack)

def dimensions(world):
    equipped=world.get('equipment',{})
    bag=next((g for g in world.get('gear',[]) if g['id']==equipped.get('backpack')),None)
    if bag:
        tier=max(0,min(3,bag.get('tier',0)))
        spec=BACKPACK_TIERS[tier]
        width=max(spec['w'],bag.get('grid_w',0))
        height=max(spec['h'],bag.get('grid_h',0))
        name=bag['name']
    else:width,height,name=10,8,'기본 휴대 공간'
    storage=world.get('player',{}).get('dungeon',{}).get('storage_level',0) if world.get('player',{}).get('dungeon') else world.get('base',{}).get('facilities',{}).get('storage',0) if world.get('base',{}).get('established') else 0
    return dict(w=width,h=height+min(6,storage*2),name=name)

def entries(world):
    result=[]
    worn=set(world.get('equipment',{}).values())
    for g in world.get('gear',[]):
        if g['id'] not in worn:result.append(dict(id=g['id'],item=g['id'],count=1,gear=g,**item_spec(g['slot'],g)))
    for key,count in sorted(world.get('inventory',{}).items()):
        if key=='gold' or count<=0:continue
        spec=item_spec(key)
        for index in range((count+spec['stack']-1)//spec['stack']):
            result.append(dict(id=f'{key}#{index}',item=key,count=min(spec['stack'],count-index*spec['stack']),**spec))
    return result

def layout(world):
    bag=dimensions(world);width,height=bag['w'],bag['h']
    rows=[0]*height;placed=[];overflow=[]
    rotations=world.get('player',{}).get('bag_rotations',{})
    for entry in sorted(entries(world),key=lambda e:(-e['w']*e['h'],-max(e['w'],e['h']),e['id'])):
        w,h=entry['w'],entry['h']
        if rotations.get(entry['id']):w,h=h,w
        options=[(w,h)] if entry['id'] in rotations or w==h else [(w,h),(h,w)]
        found=False
        for w,h in options:
            if w>width or h>height:continue
            mask=(1<<w)-1
            for y in range(height-h+1):
                for x in range(width-w+1):
                    bits=mask<<x
                    if all(not rows[j]&bits for j in range(y,y+h)):
                        for j in range(y,y+h):rows[j]|=bits
                        placed.append(dict(entry,x=x,y=y,w=w,h=h));found=True;break
                if found:break
            if found:break
        if not found:overflow.append(entry)
    return dict(**bag,capacity=width*height,used=sum(e['w']*e['h'] for e in placed),
                total=sum(e['w']*e['h'] for e in placed+overflow),entries=placed,overflow=overflow)

def can_add_gear(world,gear):
    trial=dict(world,gear=[*world.get('gear',[]),gear])
    return len(trial['gear'])<=128 and not layout(trial)['overflow']

def fit_amount(world,key,amount):
    if key=='gold':return amount
    inv=dict(world['inventory']);trial=dict(world,inventory=inv);current=inv.get(key,0)
    lo,hi=0,amount
    while lo<hi:
        mid=(lo+hi+1)//2;inv[key]=current+mid
        if layout(trial)['overflow']:hi=mid-1
        else:lo=mid
    return lo
