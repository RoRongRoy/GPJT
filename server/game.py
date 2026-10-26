"""Server-owned prototype rules. No HTTP, disk, browser, or wall-clock dependencies."""
import math
import random

from .worldmap import SIZE, POIS, MOVEMENT, ENEMY_SPAWNS, new_enemy

RECIPES = {
    'soup': {'cost': {'crop': 2, 'water': 1}, 'facility': 'kitchen', 'name': '채소 수프'},
    'elixir': {'cost': {'blood': 2, 'herb': 1, 'water': 1}, 'facility': 'alchemy', 'name': '안정화 혈액'},
    'medicine': {'cost': {'herb': 3, 'water': 2}, 'facility': 'medical', 'name': '치료제'},
}
FACILITIES = {'kitchen': '주방', 'alchemy': '연금대', 'medical': '의료실', 'storage': '저장고'}
ITEMS = {'wood': '목재', 'water': '식수', 'crop': '작물', 'herb': '약초', 'blood': '원혈',
         'metal': '부품', 'scroll': '강화 주문서', 'soup': '채소 수프', 'elixir': '안정화 혈액', 'medicine': '치료제'}


class RuleError(ValueError):
    pass


def new_world():
    return {'version': 1, 'revision': 0, 'elapsed': 0.0, 'paused': False,
            'player': {'x': 6.0, 'y': 7.0, 'species': 'human', 'origin': 'human', 'chosen': False,
                       'hp': 100.0, 'food': 90.0, 'water': 90.0, 'blood': 90.0, 'stability': 90.0,
                       'infection': 0.0, 'level': 0, 'pity': 0, 'mounted': False,
                       'unlocks': {'human': 0, 'vampire': 0}},
            'base': {'x': 6, 'y': 6, 'facilities': dict.fromkeys(FACILITIES, 0)},
            'inventory': {'wood': 12, 'water': 12, 'crop': 8, 'herb': 8, 'blood': 8,
                          'metal': 6, 'scroll': 15, 'soup': 2, 'elixir': 2, 'medicine': 1},
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
    require(dist(w['player'], w['base']) <= 2.8, '아지트 가까이에서 이용하세요.')


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
        require(not p['chosen'], '초기 종족은 이미 선택했습니다. 변환·복귀를 이용하세요.')
        require(command.get('species') in ('human', 'vampire'), '종족 오류')
        p['species'] = p['origin'] = command['species']
        p['chosen'] = True
        note(w, '인간으로 시작합니다.' if p['species'] == 'human' else '뱀파이어로 시작합니다.')
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
        require(dist(p, node) <= 2, '채집 지점 가까이 이동하세요.')
        cooldown(w, node['id'], 3)
        w['inventory'][node['kind']] += 3
        w['inventory']['scroll'] += 1
        w['quest']['collected'] += 1
        note(w, f"{ITEMS[node['kind']]} +3 · 주문서 +1")
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
        effects = {'soup': {'food': 45, 'water': 15}, 'water': {'water': 40},
                   'blood': {'blood': 30}, 'elixir': {'blood': 40, 'stability': 45},
                   'medicine': {'hp': 40}}
        for k, v in effects[item].items():
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
        require(all(math.hypot(x-n['x'], y-n['y']) >= 2 for n in POIS), '자원·NPC 지점과 겹칩니다.')
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
    elif action == 'attack':
        require(not p['mounted'], '하차·변신 해제 후 공격하세요.')
        cooldown(w, 'attack', 0.6)
        enemies = [e for e in w['enemies'] if e['hp'] > 0 and dist(p, e) <= 2.1]
        require(enemies, '가까운 공격 대상이 없습니다.')
        e = min(enemies, key=lambda e: dist(p, e))
        e['hp'] -= 24 * (1 + p['level'] * .02)
        if e['hp'] <= 0:
            e['respawn'] = w['elapsed'] + 45
            w['inventory']['scroll'] += 3
            w['inventory']['metal'] += 2
            note(w, '감염체 처치 · 주문서 +3 · 부품 +2')
    elif action == 'quest':
        require(any(n['kind'] == 'npc' and dist(p, n) <= 2.5 for n in POIS), '진영 NPC 가까이 가세요.')
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
        require(p['unlocks'][p['species']] > 0, '아지트에서 이동 연구를 먼저 하세요.')
        require(not threat(w), '적과 거리를 벌린 뒤 탑승·변신하세요.')
        if not p['mounted'] and p['species'] == 'human':
            spend(w, {'metal': 1})  # placeholder for actual fuel system
        if not p['mounted'] and p['species'] == 'vampire':
            require(p['blood'] > 10, '혈액이 부족합니다.')
            p['blood'] -= 3
        p['mounted'] = not p['mounted']
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


def tick(w, dt):
    if w['paused'] or not w['player']['chosen']:
        return
    dt = min(1.0, max(0.0, dt))
    w['elapsed'] += dt
    p = w['player']
    keys = ('food', 'water') if p['species'] == 'human' else ('blood', 'stability')
    for key in keys:
        p[key] = max(0, p[key] - dt * .035)
    if min(p[k] for k in keys) <= 0:
        p['hp'] = max(1, p['hp'] - dt * .2)
    if p['infection'] > 0:
        p['infection'] = min(100, p['infection'] + dt * .025)
    if w['dispatch'] and w['elapsed'] >= w['dispatch']['ends']:
        for key, value in {'wood': 5, 'metal': 3, 'scroll': 5, 'blood': 3, 'crop': 3}.items():
            w['inventory'][key] += value
        w['dispatch'] = None
        note(w, '파견 복귀 · 자원을 창고에 보관했습니다.')
    for e in w['enemies']:
        if e['hp'] <= 0:
            if w['elapsed'] >= e['respawn']:
                e['hp'] = 60
                e['x'], e['y'] = ENEMY_SPAWNS[e['id']]
            continue
        d = dist(e, p)
        if dist(p, w['base']) <= 2.5:
            continue
        if 1 < d < 4.8:
            e['x'] += (p['x']-e['x']) / d * dt * .65
            e['y'] += (p['y']-e['y']) / d * dt * .65
        if d <= 1.3 and w['elapsed'] >= e['attack']:
            e['attack'] = w['elapsed'] + 2.5
            p['hp'] = max(0, p['hp'] - 8)
            p['infection'] = min(100, p['infection'] + 5)
            note(w, '감염체에게 물렸습니다. 치료제를 준비하세요.')
    if p['hp'] <= 0 or p['infection'] >= 100:
        p.update(x=float(w['base']['x']), y=float(w['base']['y']+1), hp=65., infection=0., mounted=False)
        note(w, '감염/전투 불능 · 치료소에서 복구 (감염체 시체는 후속 구현)')
