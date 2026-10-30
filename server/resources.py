"""Acquisition and purpose catalogs shared by loot, building and inventory UI."""
FARM_MATERIALS = {
    'wood':'목재','metal':'부품','water':'식수','crop':'작물','herb':'약초','blood':'원혈',
    'cloth':'직물','ore':'철광석','chemicals':'화학 약품','circuits':'전자 회로',
    'plank':'건축 판재','stone':'석재','brick':'벽돌','cement':'시멘트','rebar':'철근',
    'wire':'전선','copper_pipe':'구리 배관','glass':'유리판','rubber':'고무판','bolts':'볼트',
    'hinge':'경첩','rope':'밧줄','canvas':'천막 원단','insulation':'단열재','resin':'수지',
    'fuel':'발전기 연료','battery':'축전지','motor':'소형 모터','pump':'양수 펌프',
    'filter':'정수 필터','valve':'압력 밸브','ceramic':'내열 도기','limestone':'석회석',
    'slate':'지붕 슬레이트','fertilizer':'배양 비료','seed':'재배 종자','culture':'배양 용기',
    'antiseptic':'시설 소독액','parchment':'기록용 양피지','binding':'제본 끈',
    'gothic_stone':'성곽 장식석','iron_mesh':'방호 철망',
}
CRAFT_MATERIALS = {
    'leather':'변이 가죽','bone':'단단한 뼈','silver':'은광석','sulfur':'유황',
    'crystal':'마력 수정','mutagen':'변이 촉매','obsidian':'흑요석','ancient_core':'고대 핵',
    'alloy':'은강 합금','thread':'강화 섬유','essence':'응축 정수','blessed_ink':'봉인 잉크',
    'iron_fragment':'마수 철편','weapon_core':'무기 핵','armor_plate':'괴수 갑각',
    'arcane_dust':'마력 가루','spirit_fiber':'영혼 섬유','blood_pearl':'혈정 진주',
}
ENHANCEMENT = {
    'temper_powder':dict(name='담금질 가루',bonus=.05),
    'whetstone':dict(name='강화 숫돌',bonus=.08),
    'moon_shard':dict(name='월광 파편',bonus=.10),
    'bloodstone':dict(name='강화 혈석',bonus=.12),
    'sunstone':dict(name='태양 결정',bonus=.15),
    'blessing_crystal':dict(name='축복 결정',bonus=.20),
}
SCROLLS={'scroll':'강화 주문서','weapon_scroll':'무기 각인 주문서','armor_scroll':'방어구 각인 주문서','blessed_scroll':'축복 각인 주문서'}
DROP_ITEMS={**CRAFT_MATERIALS,**{k:v['name'] for k,v in ENHANCEMENT.items()},**SCROLLS,
            'skillbook':'고대 스킬북','gold':'골드','medicine':'치료제','elixir':'안정화 혈액'}
CATEGORY_NAMES={'farming':'오브젝트 파밍 · 건설/생활','crafting':'몬스터 드랍 · 장비 제작','enhancement':'몬스터 드랍 · 강화 재료','scrolls':'몬스터 드랍 · 주문서','books':'몬스터 드랍 · 스킬북','currency':'몬스터 드랍 · 골드','supplies':'몬스터 드랍 · 회복'}
ITEM_CATEGORIES={k:dict(origin='farming',category='farming',label=CATEGORY_NAMES['farming']) for k in FARM_MATERIALS}
for category,items in [('crafting',CRAFT_MATERIALS),('enhancement',ENHANCEMENT),('scrolls',SCROLLS),('books',['skillbook']),('currency',['gold']),('supplies',['medicine','elixir'])]:
    ITEM_CATEGORIES.update({k:dict(origin='monster',category=category,label=CATEGORY_NAMES[category]) for k in items})

# Every eligible monster has one secondary roll; a level band opens more types.
# Reuse the existing supply roll, preserving equipment rarity probabilities.
def extra_drop(enemy, roll):
    level=enemy.get('level',1)
    pool=['leather','bone']+['iron_fragment','weapon_core','armor_plate','arcane_dust','spirit_fiber','blood_pearl','temper_powder','whetstone']
    if level>=15: pool+=['silver','sulfur','alloy','thread','essence','blessed_ink','moon_shard','bloodstone','weapon_scroll','armor_scroll']
    if level>=35: pool+=['crystal','mutagen','sunstone','blessing_crystal','blessed_scroll']
    if level>=60:pool+=['obsidian','ancient_core']
    if roll>=.25:return {}
    return {pool[min(len(pool)-1,int(roll/.25*len(pool)))]:1}


def facility_cost(spec, level):
    return {k:v*(level+1) for k,v in {**spec['cost'],**(spec.get('upgrade_cost',{}) if level else {})}.items()}
