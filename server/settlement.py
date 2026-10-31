"""Shared settlement progression and authored scavenging tables."""
MATERIALS = {'cloth': '직물', 'ore': '철광석', 'chemicals': '화학 약품', 'circuits': '전자 회로'}
FACILITY_SPECS = {
    'kitchen': ('주방', '생활', '식사 제작', 'kitchen', [-4,2], {'wood':3,'metal':2}),
    'alchemy': ('연금대', '생활', '안정화 혈액 제작', 'alchemy', [3,-4], {'wood':3,'metal':2}),
    'medical': ('의료실', '생활', '치료제 제작·종족 전환', 'medical', [2,4], {'wood':3,'metal':2}),
    'storage': ('저장고', '생활', '레벨당 가방 용량 +50', 'storage', [5,0], {'wood':3,'metal':2}),
    'forge': ('대장간', '장비', '무기·상의 제작', 'kitchen', [-8,-4], {'wood':8,'metal':6,'ore':4}),
    'tailor': ('재봉소', '장비', '하의·장화·장갑 제작', 'storage', [-8,2], {'wood':6,'metal':3,'cloth':4}),
    'jeweler': ('장신구 공방', '장비', '반지·목걸이 제작', 'alchemy', [-4,-8], {'wood':6,'metal':5,'ore':3}),
    'workshop': ('정비소', '생산', '부품·전자 회로 가공', 'metal', [2,-8], {'wood':6,'metal':5,'circuits':2}),
    'greenhouse': ('온실', '생산', '작물·약초 재배', 'kitchen', [8,-4], {'wood':8,'metal':3,'cloth':2}),
    'purifier': ('정수장', '생산', '식수 정제', 'water', [8,4], {'wood':5,'metal':6,'circuits':2}),
    'bloodbank': ('혈액 보관소', '생산', '원혈 배양·혈액 안정화', 'blood', [4,8], {'wood':5,'metal':6,'chemicals':3}),
    'archive': ('기록 보관소', '연구', '강화 주문서·스킬북 복원', 'storage', [-4,8], {'wood':8,'metal':4,'cloth':3}),
}
FACILITY_SPECS = {key:dict(name=v[0],category=v[1],description=v[2],prop=v[3],offset=v[4],cost=v[5]) for key,v in FACILITY_SPECS.items()}
EXTRA_RECIPES = {
    'grow_crop': dict(name='작물 재배',facility='greenhouse',cost={'water':2},output='crop',amount=3,seconds=30),
    'grow_herb': dict(name='약초 재배',facility='greenhouse',cost={'water':2,'crop':1},output='herb',amount=3,seconds=30),
    'purify_water': dict(name='식수 정제',facility='purifier',cost={'wood':1,'herb':1},output='water',amount=4,seconds=20),
    'refine_metal': dict(name='철광석 제련',facility='workshop',cost={'ore':3,'wood':1},output='metal',amount=4,seconds=20),
    'assemble_circuit': dict(name='전자 회로 조립',facility='workshop',cost={'metal':3,'chemicals':1},output='circuits',amount=2,seconds=30),
    'culture_blood': dict(name='원혈 배양',facility='bloodbank',cost={'herb':2,'chemicals':1},output='blood',amount=4,seconds=30),
    'blood_batch': dict(name='안정화 혈액 배합',facility='bloodbank',cost={'blood':3,'water':2,'chemicals':1},output='elixir',amount=2,seconds=30),
    'medical_batch': dict(name='치료제 대량 조제',facility='medical',cost={'herb':4,'chemicals':2,'cloth':1},output='medicine',amount=3,seconds=30),
    'restore_scroll': dict(name='강화 주문서 복원',facility='archive',cost={'cloth':2,'chemicals':1,'metal':1},output='scroll',amount=1,seconds=45),
    'restore_skillbook': dict(name='고대 스킬북 복원',facility='archive',level=3,cost={'scroll':15,'cloth':8,'circuits':5,'gold':150},output='skillbook',amount=1,seconds=120),
}
for slot,name,facility,cost,power in [
    ('weapon','야전 장검','forge',{'metal':8,'ore':5,'wood':2},4),
    ('armor','강철 조끼','forge',{'metal':6,'ore':4,'cloth':3},3),
    ('pants','정찰병 하의','tailor',{'cloth':5,'metal':2},2),
    ('boots','정찰병 장화','tailor',{'cloth':4,'metal':3},2),
    ('gloves','정찰병 장갑','tailor',{'cloth':3,'metal':2},2),
    ('ring','은빛 인장 반지','jeweler',{'ore':4,'metal':3,'chemicals':1},2),
    ('necklace','수호 목걸이','jeweler',{'ore':5,'metal':3,'cloth':2},3),
]:
    EXTRA_RECIPES['make_'+slot]=dict(name=name,facility=facility,cost=cost,gear_slot=slot,power=power,seconds=15)
SEARCH_SITES = {
    'car': ('버려진 차량', 'metal', {'metal':3,'circuits':1}, 45),
    'corpse': ('유품이 남은 시신', 'blood', {'cloth':2,'blood':1,'gold':3}, 60),
    'pharmacy': ('폐쇄된 약국', 'medical', {'herb':3,'chemicals':2,'medicine':1}, 75),
    'warehouse': ('봉인된 물류 창고', 'storage', {'wood':4,'cloth':3,'metal':2}, 60),
    'mine': ('폐광 광맥', 'metal', {'ore':5,'metal':1}, 45),
    'substation': ('버려진 변전소', 'alchemy', {'circuits':2,'metal':2}, 60),
    'armory': ('폐쇄 무기고', 'storage', {'ore':3,'metal':4,'cloth':1}, 90),
    'library': ('무너진 서고', 'storage', {'cloth':2,'scroll':1}, 90),
    'lab': ('격리 연구실', 'alchemy', {'chemicals':3,'circuits':1}, 75),
    'blood_lab': ('혈액 검사소', 'blood', {'blood':4,'chemicals':2}, 60),
    'garden_ruin': ('폐온실', 'kitchen', {'crop':4,'herb':2}, 45),
    'cistern_ruin': ('정수 시설 잔해', 'water', {'water':5,'metal':1}, 45),
}

from . import frontier
MATERIALS.update(frontier.MATERIALS)
EXTRA_RECIPES.update(frontier.RECIPES)
SEARCH_SITES.update(frontier.SEARCH_SITES)


# Object scavenging exclusively supplies building and living resources.
from .resources import FARM_MATERIALS, CRAFT_MATERIALS, DROP_ITEMS, ENHANCEMENT
MATERIALS.update({k:v for k,v in FARM_MATERIALS.items() if k not in ('wood','metal','water','crop','herb','blood')})
MATERIALS.update(CRAFT_MATERIALS)
MATERIALS.update({k: v for k,v in DROP_ITEMS.items() if k not in ('gold','scroll','skillbook','medicine','elixir')})
_new_farm=list(FARM_MATERIALS)[10:]
for index,(kind,(label,prop,loot,seconds)) in enumerate(list(SEARCH_SITES.items())):
    clean={k:v for k,v in loot.items() if k in FARM_MATERIALS}
    for key in _new_farm[index::len(SEARCH_SITES)]:clean[key]=2
    SEARCH_SITES[kind]=(label,prop,clean,seconds)
for index,spec in enumerate(FACILITY_SPECS.values()):
    spec['upgrade_cost']={key:1 for key in _new_farm[index::len(FACILITY_SPECS)]}
for key,materials in {'greenhouse':['water','crop','herb'],'bloodbank':['blood']}.items():
    FACILITY_SPECS[key]['upgrade_cost'].update(dict.fromkeys(materials,1))

# Equipment and its components require combat loot, never scavenged building stock.
_replacements={'metal':'iron_fragment','ore':'silver','wood':'bone','cloth':'spirit_fiber',
               'chemicals':'arcane_dust','blood':'blood_pearl','water':'mutagen','circuits':'weapon_core'}
for key,recipe in EXTRA_RECIPES.items():
    if recipe.get('gear_slot') or recipe.get('output') in DROP_ITEMS:
        cost={}
        for item,amount in recipe['cost'].items():
            item=_replacements.get(item,item)
            cost[item]=cost.get(item,0)+amount
        recipe['cost']=cost
        if recipe.get('gear_slot'):
            recipe['cost']['weapon_core' if recipe['gear_slot']=='weapon' else 'armor_plate']=1
for key,amount in [('weapon_scroll',3),('armor_scroll',3),('blessed_scroll',8)]:
    EXTRA_RECIPES['decode_'+key]=dict(name=DROP_ITEMS[key]+' 해독',facility='archive',cost={key:1},output='scroll',amount=amount,seconds=15)

from .scavenging import NEW_SITES
SEARCH_SITES.update({key:(name,'metal',loot,seconds) for key,(name,loot,seconds) in NEW_SITES.items()})

from .survival import limit_supply_sites
limit_supply_sites(SEARCH_SITES)
for key,amount,seconds in [('grow_crop',2,120),('purify_water',3,120),('culture_blood',2,180),('blood_batch',1,120)]:
    EXTRA_RECIPES[key].update(amount=amount,seconds=seconds)

FACILITY_SPECS['mobility']=dict(name='이동수단 훈련소',category='연구',description='2단계 이동수단 개조·진화',prop='metal',offset=[0,-5],cost={'wood':10,'metal':8,'bolts':3},max_level=1)
