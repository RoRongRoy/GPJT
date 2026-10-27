"""Authored world layout shared with clients; existing landmark IDs stay stable."""
SIZE = 128
LAYOUT_VERSION = 2
BASE_USE_RADIUS = 7.0
BASE_CLEAR_RADIUS = 9.0
START_BASE = (22, 22)
MOVEMENT = {'step': .48, 'interval': .10, 'mount_base': 1.55, 'mount_tier': .25}
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
for region, levels in zip(REGIONS, [(1, 3), (4, 6), (8, 10), (12, 14)]):
    region['levels'] = list(levels)

ROADS = [
    [[9, 28], [24, 33], [40, 26], [56, 34], [73, 27], [89, 34], [115, 25]],
    [[25, 33], [32, 49], [24, 67], [32, 83], [27, 106], [38, 119]],
    [[32, 83], [49, 88], [65, 80], [83, 92], [106, 98], [119, 108]],
    [[89, 34], [82, 51], [93, 67], [83, 92]],
]
WORLD_MAP = {'size': SIZE, 'layout_version': LAYOUT_VERSION, 'regions': REGIONS, 'roads': ROADS,
             'movement': MOVEMENT, 'base_radius': BASE_USE_RADIUS, 'base_clear_radius': BASE_CLEAR_RADIUS}


def region_at(x, y):
    import math
    x, y = x + math.sin(y / 13) * 5, y + math.sin(x / 17) * 4
    return min(REGIONS, key=lambda r: ((x-r['x'])**2+(y-r['y'])**2)/r['radius']**2)


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
ENEMY_SPAWNS = [(42, 12), (56, 39), (25, 55), (59, 63), (87, 39), (112, 58),
                (12, 85), (49, 105), (81, 73), (106, 94), (111, 115)]


def new_enemy(index):
    x, y = ENEMY_SPAWNS[index]
    region = region_at(x, y)
    level = region['levels'][0] + index % 3
    tier_mult = {'outskirts': 1, 'forest': 2, 'marsh': 4, 'works': 7}[region['id']]
    hp = 60 + (level-1)*18*tier_mult
    damage = 8 + (level-1)*(2 if region['id'] == 'outskirts' else 4)
    names = {'outskirts': '배회하는 감염자', 'forest': '숲의 포식자', 'marsh': '맹독 늪지 변이체', 'works': '심연의 철갑 파괴자'}
    return {'id': index, 'x': x, 'y': y, 'hp': hp, 'max_hp': hp, 'level': level,
            'name': names[region['id']], 'region': region['id'], 'damage': damage,
            'xp': 12+level*4*tier_mult, 'respawn': 0, 'attack': 0, 'returning': False}


def new_npcs():
    return [dict(n, home_x=n['x'], home_y=n['y']) for n in POIS if n['kind'] == 'npc']


def live_pois(world):
    moving = {n['id']: n for n in world['npcs']}
    return [moving.get(n['id'], n) for n in POIS]
