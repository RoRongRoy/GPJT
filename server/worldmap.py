"""Authored world layout shared with clients; existing landmark IDs stay stable."""
SIZE = 128
LAYOUT_VERSION = 2
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
for region, levels in zip(REGIONS, [(1, 3), (4, 6), (8, 10), (12, 14)]):
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
MERCHANTS = []
for faction, town in TOWNS.items():
    town['merchant']['role'] = 'supplies'
    MERCHANTS.append(town['merchant'])
    for role, label, dx, dy in [('equipment', '장비 상인', 3, -2), ('scroll', '주문서 상인', -3, 2), ('skill', '스킬 상인', 2, 3)]:
        MERCHANTS.append({'id': f'{faction}_{role}', 'name': label, 'label': label,
                          'kind': 'merchant', 'role': role, 'faction': faction,
                          'x': town['x'] + dx, 'y': town['y'] + dy})
WORLD_MAP = {'size': SIZE, 'layout_version': LAYOUT_VERSION, 'regions': REGIONS, 'roads': ROADS,
             'movement': MOVEMENT, 'base_radius': BASE_USE_RADIUS, 'base_clear_radius': BASE_CLEAR_RADIUS,
             'towns': TOWNS, 'merchants': MERCHANTS}


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


def new_enemy(index):
    x, y = ENEMY_SPAWNS[index]
    region = region_at(x, y)
    level = region['levels'][0] + index % 3
    tier_mult = {'outskirts': 1, 'forest': 2, 'marsh': 4, 'works': 7}[region['id']]
    hp = 60 + (level-1)*18*tier_mult
    damage = 8 + (level-1)*(2 if region['id'] == 'outskirts' else 4)
    prof = ENEMY_PROFILES[index % len(ENEMY_PROFILES)]
    faction = prof['faction']
    name = prof['name']
    return {'id': index, 'x': x, 'y': y, 'hp': hp, 'max_hp': hp, 'level': level,
            'name': name, 'region': region['id'], 'damage': damage, 'faction': faction,
            'xp': 12+level*4*tier_mult, 'respawn': 0, 'attack': 0, 'returning': False}


def new_npcs():
    return [dict(n, home_x=n['x'], home_y=n['y']) for n in POIS if n['kind'] == 'npc']


def live_pois(world):
    moving = {n['id']: n for n in world['npcs']}
    return [moving.get(n['id'], n) for n in POIS]
