"""Distinct salvage sites: building/living stock only, never monster equipment loot."""
# Atlas order is stable; existing site IDs and their cooldowns are untouched.
NEW_SITES = {
    'supply_crates': ('봉인된 보급 상자', {'plank':3,'bolts':2,'canvas':2}, 60),
    'fuel_drums': ('녹슨 연료 드럼통', {'fuel':3,'metal':2,'valve':1}, 75),
    'checkpoint': ('무너진 검문소', {'cloth':3,'iron_mesh':2,'rope':2}, 60),
    'generator': ('멈춘 야전 발전기', {'motor':1,'wire':3,'battery':1}, 90),
    'jeep': ('버려진 군용 지프', {'rubber':2,'bolts':3,'metal':2}, 75),
    'ambulance': ('전복된 구급차', {'antiseptic':2,'cloth':3,'glass':2}, 90),
    'vending_machine': ('파손된 자판기', {'circuits':2,'wire':2,'metal':2}, 75),
    'dumpster': ('폐기물 수거함', {'cloth':2,'rubber':2,'metal':2}, 45),
    'fallen_pole': ('쓰러진 전신주', {'wire':3,'insulation':2,'wood':2}, 60),
    'minecart': ('버려진 채굴 수레', {'ore':3,'stone':3,'bolts':2}, 75),
    'bat_cave': ('박쥐 동굴 수색', {'limestone':3,'fertilizer':2,'herb':2}, 120),
    'mine_entrance': ('폐광 입구 탐사', {'ore':3,'plank':2,'rope':2}, 120),
    'sewer': ('봉쇄된 하수 터널', {'copper_pipe':2,'valve':2,'filter':1}, 90),
    'sarcophagus': ('열린 석관', {'gothic_stone':3,'cloth':2,'binding':2}, 90),
    'graveyard': ('훼손된 묘비군', {'stone':3,'slate':2,'gothic_stone':2}, 75),
    'ritual_altar': ('버려진 의식 제단', {'parchment':2,'ceramic':2,'blood':2}, 90),
    'fallen_statue': ('쓰러진 수호 석상', {'gothic_stone':3,'limestone':2,'rebar':1}, 90),
    'mushroom_log': ('버섯이 자란 고목', {'wood':2,'herb':3,'resin':2}, 45),
    'abandoned_camp': ('버려진 야영 흔적', {'canvas':3,'rope':2,'water':2}, 60),
    'broken_vat': ('파손된 배양 실린더', {'culture':2,'glass':2,'chemicals':2}, 90),
}
SITE_ART = {key: dict(atlas='salvage', frame=i, height=[90,85,90,95,110,120,130,85,100,90,165,170,130,95,110,110,125,75,80,145][i]) for i,key in enumerate(NEW_SITES)}
# Existing cave-like deposits now have an entrance silhouette instead of a rock pile.
LEGACY_ART = {'mine':'mine_entrance','crystal_cache':'bat_cave','bone_pit':'graveyard',
              'substation':'generator','armory':'supply_crates','lab':'broken_vat',
              'blood_lab':'broken_vat','mutant_vat':'broken_vat','ancient_vault':'sarcophagus',
              'cistern_ruin':'sewer','pharmacy':'ambulance','library':'ritual_altar'}
