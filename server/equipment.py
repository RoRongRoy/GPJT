"""Server-owned equipment catalog and Lineage-inspired low per-kill probabilities."""
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
ARMOR_NAMES = {
    'normal': '해진 야전복',
    'advanced': '강화 방호복',
    'rare': '푸른 늑대 흉갑',
    'epic': '발라카스의 갑주',
    'legendary': '불멸자의 신화 갑주',
}


def roll_equipment(world, enemy, rng):
    roll = rng()
    threshold = 0
    for rarity, spec in RARITIES.items():
        threshold += spec['chance']
        if roll < threshold:
            slot = 'weapon' if rng() < .5 else 'armor'
            tier = 1 + (enemy['level']-1)//4
            base_name = WEAPON_NAMES[rarity] if slot == 'weapon' else ARMOR_NAMES[rarity]
            item = {'id': 'gear:' + str(world['next_gear_id']), 'slot': slot, 'rarity': rarity,
                    'name': f'{base_name} T{tier}',
                    'power': (4*tier if slot == 'weapon' else 2*tier) + spec['bonus']}
            world['next_gear_id'] += 1
            world['gear'].append(item)
            return item
    return None


def equipment_power(world, slot):
    item_id = world['equipment'][slot]
    return next((g['power'] for g in world['gear'] if g['id'] == item_id and g['slot'] == slot), 0)
