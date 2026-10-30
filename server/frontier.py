"""Additive frontier content; no saved landmark or equipment IDs are reassigned."""
MAX_COMBAT_LEVEL = 100
MATERIALS = {
    'leather':'변이 가죽', 'bone':'단단한 뼈', 'silver':'은광석', 'sulfur':'유황',
    'crystal':'마력 수정', 'mutagen':'변이 촉매', 'obsidian':'흑요석', 'ancient_core':'고대 핵',
    'alloy':'은강 합금', 'thread':'강화 섬유', 'essence':'응축 정수', 'blessed_ink':'봉인 잉크',
}
CONSUMABLES = {
    'field_ration':dict(name='보존 전투식량',species='human',effects={'food':70,'water':25,'mp':35}),
    'blood_serum':dict(name='농축 혈청',species='vampire',effects={'blood':65,'stability':60,'hp':35}),
    'antidote':dict(name='강력 해독제',effects={'hp':30},cleanse=100),
    'restoration_tonic':dict(name='재생 영약',effects={'hp':75,'mp':60},cleanse=40),
}
# Existing 0..255 square stays untouched. New regions fill east and south bands.
REGIONS = [
    dict(id='quarry',name='은광 절벽',subtitle='은광과 유황이 남은 무너진 채석장',x=320,y=64,radius=88,color='#6b747a',levels=[31,45],terrain='works'),
    dict(id='catacombs',name='잊힌 지하묘역',subtitle='뼈와 가죽을 수집하는 사냥터',x=64,y=320,radius=88,color='#665b76',levels=[31,45],terrain='marsh'),
    dict(id='laboratory',name='오염된 실험구역',subtitle='변이 촉매와 마력 수정을 품은 폐연구소',x=320,y=192,radius=88,color='#477769',levels=[46,60],terrain='works'),
    dict(id='wasteland',name='흑요 황무지',subtitle='정예 감염체가 지키는 흑요석 산지',x=192,y=320,radius=88,color='#74524a',levels=[61,75],terrain='outskirts'),
    dict(id='abyss',name='혈월 심연',subtitle='고대 핵을 지키는 최상위 토벌 구역',x=320,y=320,radius=88,color='#683b59',levels=[76,100],terrain='forest'),
]
MONSTER_TYPES = {
    'scorpion':dict(name='은광 전갈',scale=.75,hue=45,speed=1.2,hp_mult=.85,damage_mult=1,material='silver'),
    'basilisk':dict(name='유황 바실리스크',scale=1.1,hue=65,speed=.8,hp_mult=1.15,damage_mult=1.05,material='sulfur'),
    'gargoyle':dict(name='묘역 가고일',scale=1.0,hue=220,speed=1.15,hp_mult=.95,damage_mult=1,material='bone'),
    'stalker':dict(name='가죽 사냥꾼',scale=.9,hue=10,speed=1.35,hp_mult=.8,damage_mult=1.1,material='leather'),
    'abomination':dict(name='실험체 키메라',scale=1.3,hue=90,speed=.65,hp_mult=1.35,damage_mult=1.05,material='mutagen'),
    'crystal_guard':dict(name='수정 수호체',scale=1.15,hue=175,speed=.75,hp_mult=1.3,damage_mult=.9,material='crystal'),
    'reaper':dict(name='흑요 사신',scale=1.05,hue=280,speed=1.1,hp_mult=.95,damage_mult=1.15,material='obsidian'),
    'ash_beast':dict(name='잿불 포식자',scale=1.2,hue=355,speed=1,hp_mult=1.1,damage_mult=1.1,material='sulfur'),
    'sentinel':dict(name='고대 파수기',scale=1.25,hue=160,speed=.7,hp_mult=1.4,damage_mult=1,material='ancient_core'),
    'blood_witch':dict(name='핏빛 마녀',scale=.9,hue=315,speed=1.2,hp_mult=.8,damage_mult=1.15,material='mutagen'),
    'void_hound':dict(name='공허 추적자',scale=.8,hue=240,speed=1.4,hp_mult=.75,damage_mult=1,material='leather'),
    'ancient_lord':dict(name='혈월 고대군주',scale=1.5,hue=300,speed=.6,hp_mult=1.7,damage_mult=1.2,material='ancient_core'),
}
SITE_LEVELS = {'crystal_cache':46,'mutant_vat':46,'obsidian_vein':61,'ancient_vault':76}
MONSTER_POOLS = [
    ['scorpion','basilisk','gargoyle','stalker'],
    ['gargoyle','stalker','basilisk','scorpion'],
    ['abomination','crystal_guard','blood_witch','stalker'],
    ['reaper','ash_beast','void_hound','gargoyle'],
    ['sentinel','blood_witch','void_hound','ancient_lord'],
]
SEARCH_SITES = {
    'wreck_truck':('전복된 보급 트럭','storage',{'leather':3,'cloth':3,'metal':3},60),
    'bone_pit':('괴수 뼈무덤','blood',{'bone':4,'leather':2},60),
    'silver_vein':('은광맥','metal',{'silver':4,'ore':3},75),
    'sulfur_vent':('유황 분출구','alchemy',{'sulfur':4,'chemicals':2},75),
    'crystal_cache':('수정 공동','alchemy',{'crystal':3,'ore':3},90),
    'mutant_vat':('파손된 배양조','blood',{'mutagen':3,'blood':3},90),
    'obsidian_vein':('흑요석 광맥','metal',{'obsidian':3,'silver':2},100),
    'ancient_vault':('고대 동력 금고','storage',{'ancient_core':2,'circuits':3},120),
}
RECIPES = {
    'smelt_alloy':dict(name='은강 합금 제련',facility='workshop',level=2,cost={'silver':3,'ore':3,'sulfur':1},output='alloy',amount=2,seconds=30),
    'weave_thread':dict(name='강화 섬유 직조',facility='tailor',level=2,cost={'leather':3,'cloth':3},output='thread',amount=2,seconds=30),
    'distill_essence':dict(name='마력 정수 응축',facility='alchemy',level=2,cost={'crystal':3,'mutagen':2},output='essence',amount=2,seconds=45),
    'mix_ink':dict(name='봉인 잉크 배합',facility='archive',level=2,cost={'bone':3,'chemicals':2,'blood':2},output='blessed_ink',amount=2,seconds=30),
    'reclaim_silver':dict(name='광석에서 은 추출',facility='workshop',cost={'ore':6,'chemicals':2},output='silver',amount=2,seconds=45),
    'cure_leather':dict(name='가죽 보강',facility='tailor',cost={'cloth':5,'blood':2,'chemicals':1},output='leather',amount=2,seconds=45),
    'grow_crystal':dict(name='마력 수정 배양',facility='alchemy',level=3,cost={'silver':4,'mutagen':2,'water':3},output='crystal',amount=2,seconds=60),
    'restore_core':dict(name='고대 핵 복원',facility='workshop',level=3,cost={'obsidian':4,'circuits':5,'essence':2},output='ancient_core',amount=1,seconds=90),
    'field_ration':dict(name='보존 전투식량',facility='kitchen',level=2,cost={'crop':5,'water':2,'herb':2},output='field_ration',amount=2,seconds=30),
    'blood_serum':dict(name='농축 혈청',facility='bloodbank',level=2,cost={'blood':5,'mutagen':1,'herb':2},output='blood_serum',amount=2,seconds=30),
    'antidote':dict(name='강력 해독제',facility='medical',level=2,cost={'herb':4,'sulfur':2,'chemicals':2},output='antidote',amount=2,seconds=30),
    'restoration_tonic':dict(name='재생 영약',facility='medical',level=3,cost={'essence':2,'herb':4,'water':3},output='restoration_tonic',amount=2,seconds=45),
}
GEAR_MODELS = {}
# Power bands also provide a deterministic route toward high-level hunting.
for family,title,min_level,power,rarity,facility_level,cost in [
    ('hunter','추적자',15,14,'normal',1,{'leather':5,'bone':3,'metal':5}),
    ('silverguard','은빛 수호자',35,25,'advanced',2,{'alloy':5,'thread':3,'silver':4}),
    ('eclipse','일식',60,39,'advanced',3,{'alloy':5,'thread':4,'essence':3,'obsidian':3}),
    ('abyssal','심연 봉인',80,53,'rare',3,{'ancient_core':3,'obsidian':5,'essence':4,'blessed_ink':3}),
]:
    entries=[('armor','흉갑','forge'),('pants','각반','tailor'),('boots','장화','tailor'),('gloves','장갑','tailor'),('ring','인장 반지','jeweler'),('necklace','호부','jeweler')]
    entries += [('weapon_'+kind,label,'forge') for kind,label in [('sword','장검'),('rifle','소총'),('claw','혈조'),('staff','지팡이')]]
    for kind,label,facility in entries:
        slot='weapon' if kind.startswith('weapon_') else kind
        key=family+'_'+kind
        model=dict(name=title+' '+label,slot=slot,power=power*2 if slot=='weapon' else power,
                   min_level=min_level,rarity=rarity,model=key)
        GEAR_MODELS[key]=model
        RECIPES['make_'+key]=dict(name=model['name'],facility=facility,level=facility_level,
            combat_level=min_level,cost=dict(cost),gear_slot=slot,power=model['power'],rarity=rarity,
            min_level=min_level,model=key,seconds=45)
