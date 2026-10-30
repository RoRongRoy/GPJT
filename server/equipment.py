"""Server-owned equipment catalog and Lineage-inspired low per-kill probabilities."""
from .frontier import GEAR_MODELS

RARITIES = {
    'normal': {'name': '일반', 'color': '#c6c9c5', 'chance': .05, 'bonus': 0},
    'advanced': {'name': '고급', 'color': '#80c48e', 'chance': .01, 'bonus': 3},
    'rare': {'name': '희귀', 'color': '#80baff', 'chance': .001, 'bonus': 7},
    'epic': {'name': '영웅', 'color': '#c99aff', 'chance': .0001, 'bonus': 12},
    'legendary': {'name': '전설', 'color': '#efc878', 'chance': .00001, 'bonus': 20},
}
WEAPON_NAMES = {
    'normal': '수련자의 검',
    'advanced': '단련된 장검',
    'rare': '푸른 달빛 장검',
    'epic': '피의 군주 대검',
    'legendary': '블러드폴 집행검',
}
JOB_WEAPON_NAMES = {
    ('human', 'warrior'): WEAPON_NAMES,
    ('human', 'ranged'): {
        'normal': '수련자의 제식 권총',
        'advanced': '단련된 은탄 소총',
        'rare': '푸른 달빛 저격총',
        'epic': '심판자의 대구경 중화기',
        'legendary': '블러드폴 성광 캐논',
    },
    ('vampire', 'warrior'): {
        'normal': '수련자의 혈족 클로',
        'advanced': '단련된 핏빛 발톱',
        'rare': '붉은 달빛 크림슨 클로',
        'epic': '피의 군주 혈조',
        'legendary': '블러드폴 심연의 클로',
    },
    ('vampire', 'ranged'): {
        'normal': '수련자의 혈마법 지팡이',
        'advanced': '단련된 진홍 지팡이',
        'rare': '붉은 달빛 마도 지팡이',
        'epic': '피의 군주 혈류 스태프',
        'legendary': '블러드폴 심연의 지팡이',
    },
}
ARMOR_NAMES = {
    'normal': '해진 야전복',
    'advanced': '강화 방호복',
    'rare': '푸른 늑대 흉갑',
    'epic': '발라카스의 갑주',
    'legendary': '불멸자의 신화 갑주',
}


# Keep the legacy armor key so saved chest armor retains its identity and stats.
EQUIPMENT_SLOTS = ('weapon', 'armor', 'pants', 'boots', 'gloves', 'necklace', 'ring1', 'ring2')
GEAR_TYPES = ('weapon', 'pants', 'boots', 'gloves', 'necklace', 'ring', 'armor')
SLOT_NAMES = {'weapon': '무기', 'armor': '상의', 'pants': '하의', 'boots': '장화',
              'gloves': '장갑', 'necklace': '목걸이', 'ring': '반지'}


def slot_type(slot):
    return 'ring' if slot in ('ring1', 'ring2') else slot


def equipped_slot(world, item_id):
    return next((slot for slot in EQUIPMENT_SLOTS if world.get('equipment', {}).get(slot) == item_id), None)


def armor_power(world):
    return sum(equipment_power(world, slot) for slot in EQUIPMENT_SLOTS if slot != 'weapon')


def roll_equipment(world, enemy, rng, collect=True):
    roll = rng()
    threshold = 0
    for rarity, spec in RARITIES.items():
        threshold += spec['chance']
        if roll < threshold:
            slot = GEAR_TYPES[min(len(GEAR_TYPES)-1, int(rng()*len(GEAR_TYPES)))]
            tier = 1 + (enemy['level']-1)//4
            p = world.get('player', {})
            wep_table = JOB_WEAPON_NAMES.get((p.get('species', 'human'), p.get('job', 'warrior')), WEAPON_NAMES)
            base_name = wep_table[rarity] if slot == 'weapon' else ARMOR_NAMES[rarity] if slot == 'armor' else f"{spec['name']} 황혼의 {SLOT_NAMES[slot]}"
            item = {'id': 'gear:' + str(world['next_gear_id']), 'slot': slot, 'rarity': rarity,
                    'name': f'{base_name} T{tier}',
                    'power': (4*tier if slot == 'weapon' else 2*tier) + spec['bonus']}
            if enemy['level'] >= 15:
                family = 'abyssal' if enemy['level'] >= 80 else 'eclipse' if enemy['level'] >= 60 else 'silverguard' if enemy['level'] >= 35 else 'hunter'
                kind = {('human','warrior'):'sword',('human','ranged'):'rifle',('vampire','warrior'):'claw',('vampire','ranged'):'staff'}.get((p.get('species','human'),p.get('job','warrior')), 'sword')
                model = GEAR_MODELS[family+'_'+('weapon_'+kind if slot=='weapon' else slot)]
                item.update(name=f"{model['name']} T{tier}", model=model['model'], min_level=model['min_level'],
                            power=max(item['power'], model['power'] + spec['bonus']))
            world['next_gear_id'] += 1
            if collect:
                world['gear'].append(item)
            return item
    return None


def equipment_power(world, slot):
    item_id = world.get('equipment', {}).get(slot)
    return next((g['power'] for g in world.get('gear', []) if g['id'] == item_id and g['slot'] == slot_type(slot)), 0)
