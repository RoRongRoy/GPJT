"""Authored world layout shared with clients; existing landmark IDs stay stable."""
SIZE = 64
BASE_USE_RADIUS = 2.8
MOVEMENT = {'step': .48, 'interval': .10, 'mount_base': 1.55, 'mount_tier': .25}
REGIONS = [
    {'id': 'outskirts', 'name': '버려진 외곽', 'subtitle': '옛 야영지와 생존자의 길',
     'x': 0, 'y': 0, 'width': 32, 'height': 32, 'color': '#565962'},
    {'id': 'forest', 'name': '잿빛 소나무숲', 'subtitle': '숲 사이의 보급로를 따라서',
     'x': 32, 'y': 0, 'width': 32, 'height': 32, 'color': '#3c5550'},
    {'id': 'marsh', 'name': '안개 저지대', 'subtitle': '갈대와 약초가 남은 물가',
     'x': 0, 'y': 32, 'width': 32, 'height': 32, 'color': '#48616e'},
    {'id': 'works', 'name': '침묵의 공업지대', 'subtitle': '녹슨 지붕 아래 남은 물자',
     'x': 32, 'y': 32, 'width': 32, 'height': 32, 'color': '#71616a'},
]
WORLD_MAP = {'size': SIZE, 'regions': REGIONS, 'movement': MOVEMENT, 'base_radius': BASE_USE_RADIUS}
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
ENEMY_SPAWNS = [(12, 11), (15, 9), (16, 14), (27, 27), (39, 19), (52, 29),
                (12, 43), (27, 53), (41, 35), (50, 46), (57, 57)]


def new_enemy(index):
    x, y = ENEMY_SPAWNS[index]
    return {'id': index, 'x': x, 'y': y, 'hp': 60, 'respawn': 0, 'attack': 0}
