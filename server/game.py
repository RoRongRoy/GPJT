"""Server-owned prototype rules. No HTTP, disk, browser, or wall-clock dependencies."""
import math
import random

from .worldmap import SIZE, POIS, MOVEMENT, ENEMY_SPAWNS, new_enemy, BASE_USE_RADIUS, START_BASE, LAYOUT_VERSION, new_npcs, live_pois

from .equipment import RARITIES, roll_equipment, equipment_power

RECIPES = {
    'soup': {'cost': {'crop': 2, 'water': 1}, 'facility': 'kitchen', 'name': '채소 수프'},
    'elixir': {'cost': {'blood': 2, 'herb': 1, 'water': 1}, 'facility': 'alchemy', 'name': '안정화 혈액'},
    'medicine': {'cost': {'herb': 3, 'water': 2}, 'facility': 'medical', 'name': '치료제'},
}
FACILITIES = {'kitchen': '주방', 'alchemy': '연금대', 'medical': '의료실', 'storage': '저장고'}
ITEMS = {'wood': '목재', 'water': '식수', 'crop': '작물', 'herb': '약초', 'blood': '원혈',
         'metal': '부품', 'scroll': '강화 주문서', 'soup': '채소 수프', 'elixir': '안정화 혈액', 'medicine': '치료제'}


COMBAT = {
    'attack': {'name': '기본 공격', 'cooldown': .6, 'range': 2.1, 'damage': 24},
    'sweep': {'name': '회전 베기', 'vampire_name': '혈월 베기', 'cooldown': 5, 'range': 2.7, 'damage': 32, 'cost': 6, 'mp_cost': 12, 'hp_cost': 8},
    'recover': {'name': '숨 고르기', 'vampire_name': '혈액 재생', 'cooldown': 10, 'heal': 18, 'cost': 8, 'mp_cost': 15, 'hp_cost': 6},
}

POI_CONTENTS = {
    'wood': [('wood', 3), ('scroll', 1), ('herb', 1)],
    'water': [('water', 3), ('scroll', 1), ('crop', 1)],
    'crop': [('crop', 3), ('scroll', 1), ('water', 1)],
    'herb': [('herb', 3), ('scroll', 1), ('blood', 1)],
    'blood': [('blood', 3), ('scroll', 1), ('herb', 1)],
    'metal': [('metal', 3), ('scroll', 1), ('wood', 1)],
}


def ensure_starter_gear(w):
    gear = w.setdefault('gear', [])
    equip = w.setdefault('equipment', {'weapon': None, 'armor': None})
    species = w['player'].get('species', 'human')
    changed = False
    # Earlier starter sets used 'common'; the shared rarity catalog uses 'normal'.
    for item in gear:
        if item.get('rarity') == 'common':
            item['rarity'] = 'normal'
            changed = True
    if not any(g.get('slot') == 'weapon' for g in gear):
        wep = {
            'id': 'gear:starter-weapon',
            'slot': 'weapon',
            'rarity': 'normal',
            'tier': 0,
            'power': 1,
            'name': '녹슨 기본 단검' if species == 'human' else '무딘 혈족 손톱',
        }
        gear.append(wep)
        if not equip.get('weapon'):
            equip['weapon'] = wep['id']
        changed = True
    if not any(g.get('slot') == 'armor' for g in gear):
        arm = {
            'id': 'gear:starter-armor',
            'slot': 'armor',
            'rarity': 'normal',
            'tier': 0,
            'power': 1,
            'name': '해진 기본 조끼' if species == 'human' else '빛바랜 밤의 외투',
        }
        gear.append(arm)
        if not equip.get('armor'):
            equip['armor'] = arm['id']
        changed = True
    return changed


def bag_capacity(w):
    return 160 + w['base']['facilities'].get('storage', 0) * 50 + (w['player'].get('combat_level', 1) - 1) * 10


def bag_used(w):
    return sum(w['inventory'].values()) + len(w.get('gear', [])) * 4


def bag_full(w):
    return bag_used(w) >= bag_capacity(w) or len(w.get('gear', [])) >= 20


def gain_xp(w, amount):
    p = w['player']
    p['xp'] = p.get('xp', 0) + amount
    while p['combat_level'] < 50 and p['xp'] >= p['combat_level'] * 40:
        p['xp'] -= p['combat_level'] * 40
        p['combat_level'] += 1
        p['hp'] = min(100.0, p['hp'] + 25.0)
    if p['combat_level'] >= 50:
        p['xp'] = 0


def damage_enemy(w, enemy, damage, rng=random.random):
    if enemy['hp'] <= 0:
        return
    enemy['hp'] = max(0, enemy['hp'] - damage)
    if enemy['hp'] == 0:
        enemy['respawn'] = w['elapsed'] + 45
        tier_bonus = max(0, (enemy.get('level', 1) - 1) // 3)
        scroll_drop = 3 + (2 if enemy.get('level', 1) >= 8 else 0)
        metal_drop = 2 + tier_bonus
        drop_items = {'scroll': scroll_drop, 'metal': metal_drop}
        if tier_bonus >= 1:
            supply_key = 'herb' if tier_bonus == 1 else 'blood' if tier_bonus == 2 else 'elixir'
            drop_items[supply_key] = tier_bonus
        if rng() < .2:
            drop_items['medicine'] = 1
        item = roll_equipment(w, enemy, rng, collect=False)
        gain_xp(w, enemy['xp'])
        drop_id = 'drop:' + str(w.get('next_drop_id', 1))
        w['next_drop_id'] = w.get('next_drop_id', 1) + 1
        w.setdefault('drops', []).append({
            'id': drop_id,
            'x': round(enemy['x'], 2),
            'y': round(enemy['y'], 2),
            'label': f"{enemy['name']} 전리품",
            'items': drop_items,
            'gear': [item] if item else [],
        })
        if item:
            note(w, f"{enemy['name']} Lv.{enemy.get('level', 1)} 처치 · EXP +{enemy['xp']} · [{RARITIES[item['rarity']]['name']}] {item['name']} 필드 드랍!")
        else:
            note(w, f"{enemy['name']} Lv.{enemy.get('level', 1)} 처치 · EXP +{enemy['xp']} · 필드에 전리품을 드랍했습니다.")


class RuleError(ValueError):
    pass


def new_world():
    return {'version': 1, 'layout_version': LAYOUT_VERSION, 'revision': 0, 'elapsed': 0.0, 'paused': False,
            'player': {'x': float(START_BASE[0]), 'y': float(START_BASE[1]+1), 'species': 'human', 'origin': 'human', 'chosen': False,
                       'hp': 100.0, 'mp': 100.0, 'food': 90.0, 'water': 90.0, 'blood': 90.0, 'stability': 90.0,
                       'infection': 0.0, 'combat_level': 1, 'xp': 0, 'level': 0, 'pity': 0, 'mounted': False,
                       'unlocks': {'human': 0, 'vampire': 0}},
            'base': {'x': START_BASE[0], 'y': START_BASE[1], 'facilities': dict.fromkeys(FACILITIES, 0)},
            'inventory': {'wood': 12, 'water': 12, 'crop': 8, 'herb': 8, 'blood': 8,
                          'metal': 6, 'scroll': 15, 'soup': 2, 'elixir': 2, 'medicine': 1},
            'gear': [], 'equipment': {'weapon': None, 'armor': None}, 'next_gear_id': 1,
            'npcs': new_npcs(), 'encounter_version': 1,
            'milestones': [], 'cooldowns': {}, 'dispatch': None, 'quest': {'collected': 0, 'round': 0},
            'enemies': [new_enemy(i) for i in range(len(ENEMY_SPAWNS))],
            'log': ['격리구역에 도착했습니다. 아지트에서 주방과 연금대를 마련하세요.']}


def note(w, message):
    w['log'] = [message] + w['log'][:7]


def dist(a, b):
    return math.hypot(a['x'] - b['x'], a['y'] - b['y'])


def require(value, message):
    if not value:
        raise RuleError(message)


def spend(w, costs):
    require(all(w['inventory'].get(k, 0) >= v for k, v in costs.items()), '재료가 부족합니다.')
    for k, v in costs.items():
        w['inventory'][k] -= v


def at_base(w):
    require(dist(w['player'], w['base']) <= BASE_USE_RADIUS, '아지트 가까이에서 이용하세요.')


def threat(w):
    return any(e['hp'] > 0 and dist(e, w['player']) < 3 for e in w['enemies'])


def cooldown(w, key, seconds):
    require(w['elapsed'] >= w['cooldowns'].get(key, 0), '잠시 후 다시 시도하세요.')
    w['cooldowns'][key] = w['elapsed'] + seconds


def act(w, command, rng=random.random):
    """Mutates a candidate world; caller commits only on success."""
    require(isinstance(command, dict), '명령 형식 오류')
    action = command.get('action')
    p = w['player']
    if action == 'pause':
        w['paused'] = not w['paused']
        return
    require(not w['paused'], '일시정지를 해제하세요.')
    if action == 'choose':
        require(command.get('species') in ('human', 'vampire'), '종족 오류')
        if p.get('chosen'):
            fresh = new_world()
            for k in ('player', 'inventory', 'gear', 'equipment', 'cooldowns', 'quest', 'milestones', 'dispatch'):
                w[k] = fresh[k]
            p = w['player']
            p['x'] = float(w['base']['x'])
            p['y'] = float(w['base']['y'] + 1)
        p['species'] = p['origin'] = command['species']
        p['chosen'] = True
        ensure_starter_gear(w)
        note(w, '인간으로 시작합니다. (기본 장비 착용 · MP 활성)' if p['species'] == 'human' else '뱀파이어로 시작합니다. (기본 장비 착용 · 흡혈/체력재생 활성)')
        return
    require(p['chosen'], '먼저 시작 종족을 선택하세요.')
    if action == 'move':
        dx, dy = command.get('dx'), command.get('dy')
        require(type(dx) is int and type(dy) is int and dx in (-1, 0, 1) and dy in (-1, 0, 1) and (dx or dy), '이동 입력 오류')
        cooldown(w, 'move', MOVEMENT['interval'])
        speed = MOVEMENT['step']
        if p['mounted']:
            tier = p['unlocks'][p['species']]
            if p['species'] == 'vampire' and p['blood'] <= 5:
                p['mounted'] = False
                note(w, '혈액이 부족해 안전하게 착지했습니다.')
            if p['mounted']:
                speed *= MOVEMENT['mount_base'] + tier * MOVEMENT['mount_tier']
                if p['species'] == 'vampire':
                    p['blood'] = max(0, p['blood'] - 0.18)
        norm = math.hypot(dx, dy)
        p['x'] = max(1, min(SIZE - 2, p['x'] + dx / norm * speed))
        p['y'] = max(1, min(SIZE - 2, p['y'] + dy / norm * speed))
    elif action == 'gather':
        node = next((n for n in POIS if n['id'] == command.get('id')), None)
        require(node and node['kind'] != 'npc', '채집 지점 오류')
        require(dist(p, node) <= 3.5, '채집 지점 가까이 이동하세요.')
        selected = command.get('items')
        if selected is not None:
            require(isinstance(selected, list) and len(selected) > 0, '파밍할 아이템을 선택하세요.')
            require(not bag_full(w), '인벤토리가 가득 찼습니다.')
            allowed = dict(POI_CONTENTS.get(node['kind'], [(node['kind'], 3), ('scroll', 1)]))
            require(all(isinstance(k, str) and k in allowed for k in selected), '선택한 아이템 오류')
            cooldown(w, node['id'], 3)
            gained = []
            for k in dict.fromkeys(selected):
                space = max(0, bag_capacity(w) - bag_used(w))
                take = min(allowed[k], space)
                if take > 0:
                    w['inventory'][k] += take
                    gained.append(f"{ITEMS[k]} +{take}")
            require(gained, '인벤토리가 가득 찼습니다.')
            w['quest']['collected'] += 1
            note(w, '선택 파밍 · ' + ' · '.join(gained))
        else:
            cooldown(w, node['id'], 3)
            w['inventory'][node['kind']] += 3
            w['inventory']['scroll'] += 1
            w['quest']['collected'] += 1
            note(w, f"{ITEMS[node['kind']]} +3 · 주문서 +1")
    elif action == 'loot':
        drops = w.get('drops', [])
        drop_id = command.get('id')
        drop = next((d for d in drops if d['id'] == drop_id), None) if drop_id else min((d for d in drops if dist(p, d) <= 3.5), key=lambda d: dist(p, d), default=None)
        require(drop and dist(p, drop) <= 3.5, '전리품 가까이 이동하세요.')
        require(not bag_full(w), '인벤토리가 가득 찼습니다.')
        target_item = command.get('item')
        gained = []
        if target_item and target_item != 'all':
            if isinstance(target_item, str) and target_item.startswith('gear:'):
                g = next((x for x in drop.get('gear', []) if x['id'] == target_item), None)
                require(g, '이미 획득한 장비입니다.')
                require(len(w['gear']) < 20 and bag_used(w) + 4 <= bag_capacity(w), '인벤토리가 가득 찼습니다.')
                drop['gear'].remove(g)
                w['gear'].append(g)
                gained.append(f"[{RARITIES[g['rarity']]['name']}] {g['name']}")
            else:
                require(isinstance(target_item, str) and target_item in drop.get('items', {}), '이미 획득한 아이템입니다.')
                space = max(0, bag_capacity(w) - bag_used(w))
                take = min(drop['items'][target_item], space)
                require(take > 0, '인벤토리가 가득 찼습니다.')
                w['inventory'][target_item] += take
                drop['items'][target_item] -= take
                if drop['items'][target_item] <= 0:
                    del drop['items'][target_item]
                gained.append(f"{ITEMS[target_item]} +{take}")
        else:
            for g in list(drop.get('gear', [])):
                if len(w['gear']) < 20 and bag_used(w) + 4 <= bag_capacity(w):
                    drop['gear'].remove(g)
                    w['gear'].append(g)
                    gained.append(f"[{RARITIES[g['rarity']]['name']}] {g['name']}")
            for k, amount in list(drop.get('items', {}).items()):
                space = max(0, bag_capacity(w) - bag_used(w))
                take = min(amount, space)
                if take > 0:
                    w['inventory'][k] += take
                    drop['items'][k] -= take
                    if drop['items'][k] <= 0:
                        del drop['items'][k]
                    gained.append(f"{ITEMS[k]} +{take}")
            require(gained, '인벤토리가 가득 찼습니다.')
        if not drop.get('items') and not drop.get('gear'):
            drops.remove(drop)
        note(w, '전리품 루팅 · ' + ' · '.join(gained))
    elif action == 'equip':
        item = next((g for g in w['gear'] if g['id'] == command.get('item')), None)
        require(item, '보유하지 않은 장비입니다.')
        w['equipment'][item['slot']] = item['id']
        note(w, item['name'] + ' 착용')
    elif action == 'unequip':
        slot = command.get('slot')
        require(isinstance(slot, str) and slot in ('weapon', 'armor'), '장비 부위 오류')
        require(w['equipment'][slot], '착용한 장비가 없습니다.')
        w['equipment'][slot] = None
    elif action == 'craft':
        at_base(w)
        recipe = RECIPES.get(command.get('recipe'))
        require(recipe, '조합식 오류')
        require(w['base']['facilities'][recipe['facility']] > 0, '해당 시설을 먼저 건설하세요.')
        spend(w, recipe['cost'])
        w['inventory'][command['recipe']] += 1
        note(w, recipe['name'] + ' 제작 완료')
    elif action == 'consume':
        item = command.get('item')
        require(item in ('soup', 'water', 'blood', 'elixir', 'medicine'), '소모품 오류')
        if item in ('soup', 'water'):
            require(p['species'] == 'human', '인간용 식사입니다.')
        if item in ('blood', 'elixir'):
            require(p['species'] == 'vampire', '뱀파이어용 혈액입니다.')
        spend(w, {item: 1})
        effects = {'soup': {'food': 45, 'water': 15, 'mp': 25}, 'water': {'water': 40, 'mp': 30},
                   'blood': {'blood': 30, 'hp': 12}, 'elixir': {'blood': 40, 'stability': 45, 'hp': 20},
                   'medicine': {'hp': 40, 'mp': 20}}
        for k, v in effects[item].items():
            if k in p:
                p[k] = min(100, p[k] + v)
        if item == 'medicine':
            p['infection'] = max(0, p['infection'] - 60)
        note(w, ITEMS[item] + ' 사용')
    elif action == 'build':
        at_base(w)
        name = command.get('facility')
        require(name in FACILITIES, '시설 오류')
        level = w['base']['facilities'][name]
        require(level < 3, '프로토타입 최대 레벨입니다.')
        spend(w, {'wood': 3 * (level + 1), 'metal': 2 * (level + 1)})
        w['base']['facilities'][name] += 1
        note(w, f'{FACILITIES[name]} Lv.{level + 1}')
    elif action == 'relocate':
        require(not threat(w), '적이 가까이 있습니다. 안전한 곳에서 이동하세요.')
        x, y = round(p['x']), round(p['y'])
        require(all(math.hypot(x-n['x'], y-n['y']) >= 2 for n in live_pois(w)), '자원·NPC 지점과 겹칩니다.')
        w['base']['x'], w['base']['y'] = x, y
        note(w, '아지트 즉시 이동 · 시설과 보관품 유지')
    elif action == 'enhance':
        at_base(w)
        level = p['level']
        require(level < 10, '최대 강화 단계입니다.')
        cost, chance, pity = (1, 1, 0) if level < 3 else (2, .8, 2) if level < 6 else (3, .6, 3) if level < 9 else (5, .4, 4)
        spend(w, {'scroll': cost})
        if p['pity'] >= pity or rng() < chance:
            p['level'] += 1
            p['pity'] = 0
            note(w, f"강화 성공 +{p['level']}")
        else:
            p['pity'] += 1
            note(w, f"강화 실패 · 단계 유지 · 누적 {p['pity']}")
    elif action in ('attack', 'skill'):
        require(not p['mounted'], '하차·변신 해제 후 사용하세요.')
        skill = command.get('skill') if action == 'skill' else 'attack'
        require(isinstance(skill, str) and skill in ('attack', 'sweep', 'recover') and
                (action == 'attack' or skill != 'attack'), '알 수 없는 스킬입니다.')
        spec = COMBAT[skill]
        is_vamp = (p['species'] == 'vampire')
        meter = 'blood' if is_vamp else 'food'
        require(p[meter] >= spec.get('cost', 0), '포만도 또는 혈액량이 부족합니다.')
        if not is_vamp and action == 'skill':
            mp_cost = spec.get('mp_cost', spec.get('cost', 0))
            require(p.get('mp', 100.0) >= mp_cost, 'MP가 부족합니다.')
        if is_vamp and action == 'skill':
            hp_cost = spec.get('hp_cost', 6)
            require(p['hp'] > hp_cost, '스킬 사용에 필요한 체력이 부족합니다.')
        if skill == 'recover':
            require(p['hp'] < 100, '이미 체력이 가득합니다.')
            cooldown(w, 'skill:recover', spec['cooldown'])
            p[meter] -= spec['cost']
            if is_vamp:
                hp_cost = spec.get('hp_cost', 6)
                p['hp'] = min(100, p['hp'] - hp_cost + spec['heal'] + hp_cost)
            else:
                p['mp'] = max(0.0, p.get('mp', 100.0) - spec.get('mp_cost', 15))
                p['hp'] = min(100, p['hp'] + spec['heal'])
        else:
            enemies = [e for e in w['enemies'] if e['hp'] > 0 and dist(p, e) <= spec['range']]
            require(enemies or skill == 'attack', '가까운 공격 대상이 없습니다.')
            if skill == 'sweep':
                cooldown(w, 'skill:sweep', spec['cooldown'])
            cooldown(w, 'attack', COMBAT['attack']['cooldown'])
            p[meter] -= spec.get('cost', 0)
            if skill == 'sweep':
                if is_vamp:
                    p['hp'] = max(1.0, p['hp'] - spec.get('hp_cost', 8))
                else:
                    p['mp'] = max(0.0, p.get('mp', 100.0) - spec.get('mp_cost', 12))
            targets = enemies if skill == 'sweep' else ([min(enemies, key=lambda e: dist(p, e))] if enemies else [])
            damage = (spec['damage'] + equipment_power(w, 'weapon') + (p['combat_level']-1)*3) * (1 + p['level'] * .02)
            for enemy in targets:
                damage_enemy(w, enemy, damage, rng)
                if is_vamp:
                    leeched = round(min(10.0, max(4.0, damage * 0.18)), 1)
                    p['hp'] = min(100.0, p['hp'] + leeched)
                    p['blood'] = min(100.0, p['blood'] + 1.5)
    elif action == 'quest':
        require(any(n['kind'] == 'npc' and dist(p, n) <= 2.5 for n in live_pois(w)), '진영 NPC 가까이 가세요.')
        require(w['quest']['collected'] >= 5, '자원 채집을 5회 완료하세요.')
        w['quest']['collected'] -= 5
        w['quest']['round'] += 1
        w['inventory']['scroll'] += 10
        w['inventory']['medicine'] += 1
        note(w, '보급 의뢰 완료 · 주문서 +10 · 치료제 +1')
    elif action == 'dispatch':
        at_base(w)
        require(w['dispatch'] is None, '이미 파견 중입니다.')
        spend(w, {'crop' if p['species'] == 'human' else 'blood': 1})
        w['dispatch'] = {'ends': w['elapsed'] + 60, 'species': p['species']}
        note(w, '동료/종복 파견 · 월드 활동 시간 60초')
    elif action == 'convert':
        at_base(w)
        require(not threat(w), '안전한 곳에서 전환하세요.')
        require(w['base']['facilities']['medical'] > 0, '의료실이 필요합니다.')
        spend(w, {'herb': 2, 'water': 1})
        p['species'] = 'vampire' if p['species'] == 'human' else 'human'
        p['mounted'] = False
        note(w, '종족 변환/복귀 완료 · 아지트와 연구 유지 (프로토타입 의식)')
    elif action == 'research':
        at_base(w)
        tier = p['unlocks'][p['species']]
        require(tier < 2, '상위 형태는 후속 개발입니다.')
        cost = {'metal': 5*(tier+1), 'wood': 3} if p['species'] == 'human' else {'blood': 5*(tier+1), 'herb': 3}
        spend(w, cost)
        p['unlocks'][p['species']] += 1
        note(w, '이동수단 연구 완료')
    elif action == 'mount':
        require(not threat(w), '적과 거리를 벌린 뒤 탑승·변신하세요.')
        if not p['mounted'] and p['species'] == 'vampire':
            require(p['blood'] > 5, '혈액이 부족합니다.')
            p['blood'] -= 2
        p['mounted'] = not p['mounted']
        form_name = ('다크에덴 슬레이어 바이크' if p['unlocks']['human'] < 2 else '아머드 배틀 크루저') if p['species'] == 'human' else ('블러드 배트 변신' if p['unlocks']['vampire'] < 2 else '아크데몬 군주 변신')
        note(w, f"{form_name} {'탑승·변신 (이동속도 상승)' if p['mounted'] else '해제'}")
    elif action == 'rescue':
        require(p['hp'] <= 30 or p['infection'] >= 60, '위급할 때 이용할 수 있습니다.')
        p.update(x=float(w['base']['x']), y=float(w['base']['y']+1), hp=70., infection=0., mounted=False)
        note(w, '중립 치료소 구조 · 자산 유지 (프로토타입 복구 지원)')
    else:
        raise RuleError('알 수 없는 명령입니다.')

    if action in ('gather', 'build', 'craft', 'consume', 'quest'):
        detail = command.get('facility') or command.get('recipe') or command.get('item') or ''
        milestone = action + (':' + detail if detail else '')
        if milestone not in w.setdefault('milestones', []):
            w['milestones'].append(milestone)


def _tick_actor(w, prof, dt):
    p = prof['player']
    if not p.get('chosen'):
        return
    keys = ('food', 'water') if p['species'] == 'human' else ('blood', 'stability')
    for key in keys:
        p[key] = max(0, p[key] - dt * .035)
    if p['species'] == 'human':
        p['mp'] = min(100.0, p.get('mp', 100.0) + dt * 1.8)
    elif p['hp'] > 0 and p.get('blood', 0) > 0:
        p['hp'] = min(100.0, p['hp'] + dt * 1.2)
    if min(p[k] for k in keys) <= 0:
        p['hp'] = max(1, p['hp'] - dt * .2)
    if p['infection'] > 0:
        p['infection'] = min(100, p['infection'] + dt * .025)
    if prof.get('dispatch') and w['elapsed'] >= prof['dispatch']['ends']:
        for key, value in {'wood': 5, 'metal': 3, 'scroll': 5, 'blood': 3, 'crop': 3}.items():
            prof['inventory'][key] += value
        prof['dispatch'] = None
        note(w, '파견 복귀 · 자원을 창고에 보관했습니다.')


def _profile_armor(prof):
    item_id = prof.get('equipment', {}).get('armor')
    item = next((g for g in prof.get('gear', []) if g['id'] == item_id), None)
    return item['power'] if item else 0


def tick(w, dt, extra_profiles=None):
    all_profiles = [w, *(extra_profiles or [])]
    chosen_profiles = [prof for prof in all_profiles if prof['player'].get('chosen')]
    if w['paused'] or not chosen_profiles:
        return
    dt = min(1.0, max(0.0, dt))
    w['elapsed'] += dt
    for prof in chosen_profiles:
        _tick_actor(w, prof, dt)
    for index, npc in enumerate(w['npcs']):
        patrol(npc, {'x': npc['home_x'], 'y': npc['home_y']}, w['elapsed'], index+3, 1.8, dt)
    for e in w['enemies']:
        home = dict(zip(('x', 'y'), ENEMY_SPAWNS[e['id']]))
        if e['hp'] <= 0:
            if w['elapsed'] >= e['respawn']:
                e.update(hp=e['max_hp'], x=home['x'], y=home['y'], returning=False)
            continue
        target_prof = min(chosen_profiles, key=lambda prof: dist(e, prof['player']))
        p = target_prof['player']
        d = dist(e, p)
        protected = dist(p, w['base']) <= BASE_USE_RADIUS
        if dist(e, home) > 10:
            e['returning'] = True
        if e['returning']:
            move_toward(e, home, dt*.9)
            if dist(e, home) < .2:
                e['returning'] = False
            continue
        if protected or d >= 4.8:
            if dist(e, home) > 3.5:
                move_toward(e, home, dt*.65)
            else:
                patrol(e, home, w['elapsed'], e['id'], 3, dt)
            continue
        if d > 1:
            move_toward(e, p, dt*.8)
        if d <= 1.3 and w['elapsed'] >= e['attack']:
            e['attack'] = w['elapsed'] + 2.5
            armor = _profile_armor(target_prof)
            p['hp'] = max(0, p['hp'] - max(1, e['damage'] - armor - (p.get('combat_level', 1) - 1) // 2))
            p['infection'] = min(100, p['infection'] + 5)
            note(w, f"{e['name']} Lv.{e['level']}의 공격 · 치료제를 준비하세요.")
    for prof in chosen_profiles:
        p = prof['player']
        if p['hp'] <= 0 or p['infection'] >= 100:
            p.update(x=float(w['base']['x']), y=float(w['base']['y']+1), hp=65., infection=0., mounted=False)
            note(w, '감염/전투 불능 · 치료소에서 복구 (감염체 시체는 후속 구현)')


def move_toward(actor, target, step):
    distance = dist(actor, target)
    if distance > 0:
        step = min(distance, step)
        actor['x'] += (target['x']-actor['x'])/distance*step
        actor['y'] += (target['y']-actor['y'])/distance*step


def patrol(actor, home, elapsed, seed, radius, dt):
    angle = elapsed*.75 + seed*2.4
    wave = .72 + .26*math.sin(elapsed*.43 + seed*1.7)
    target = {'x': home['x']+math.cos(angle)*radius*wave, 'y': home['y']+math.sin(angle)*radius*wave}
    move_toward(actor, target, dt*1.45)
