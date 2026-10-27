"""Server-owned equipment catalog and absolute per-kill probabilities."""
RARITIES = {
    'normal': {'name': '일반', 'color': '#c6c9c5', 'chance': .05, 'bonus': 0},
    'advanced': {'name': '고급', 'color': '#80c48e', 'chance': .01, 'bonus': 3},
    'rare': {'name': '희귀', 'color': '#80baff', 'chance': .001, 'bonus': 7},
    'epic': {'name': '영웅', 'color': '#c99aff', 'chance': .0001, 'bonus': 12},
    'legendary': {'name': '전설', 'color': '#efc878', 'chance': .00001, 'bonus': 20},
}


def roll_equipment(world, enemy, rng):
    roll = rng()
    threshold = 0
    for rarity, spec in RARITIES.items():
        threshold += spec['chance']
        if roll < threshold:
            slot = 'weapon' if rng() < .5 else 'armor'
            tier = 1 + (enemy['level']-1)//4
            item = {'id': 'gear:' + str(world['next_gear_id']), 'slot': slot, 'rarity': rarity,
                    'name': ('사냥꾼의 검' if slot == 'weapon' else '야전 방호복') + ' T' + str(tier),
                    'power': (4*tier if slot == 'weapon' else 2*tier) + spec['bonus']}
            world['next_gear_id'] += 1
            world['gear'].append(item)
            return item
    return None


def equipment_power(world, slot):
    item_id = world['equipment'][slot]
    return next((g['power'] for g in world['gear'] if g['id'] == item_id and g['slot'] == slot), 0)
