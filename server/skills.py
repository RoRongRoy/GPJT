"""Job-exclusive, opt-in skills. Shared IDs from the original six remain compatible."""

def skill(name, level, style, **effects):
    spec = {'name': name, 'unlock_level': level, 'book_cost': 0 if level == 2 else 1 if level < 10 else 2 if level < 20 else 3,
            'requires_learning': True, 'category': style, 'cost': 5 + level // 6,
            'mp_cost': 10 + level // 2, 'hp_cost': 5 + level // 6,
            'cooldown': 5 + level // 3, **effects}
    details = []
    if spec.get('damage'):
        details.append(f"사거리 {spec['range']} · 기본 피해 {spec['damage']}")
    if spec.get('blast_radius'):
        details.append(f"대상 주변 반경 {spec['blast_radius']} 폭발")
    elif spec.get('aoe'):
        details.append('주변 적 전체 타격')
    if spec.get('stun'):
        details.append(f"적 행동 {spec['stun']}초 중단")
    if spec.get('heal'):
        details.append(f"체력 {spec['heal']} 회복")
    if spec.get('cleanse'):
        details.append(f"감염 {spec['cleanse']} 정화")
    if spec.get('leech_mult'):
        details.append(f"피해의 {round(spec['leech_mult'] * 100)}% 흡혈 (대상당 4~16)")
    spec['desc'] = ' · '.join(details) + '.'
    spec['visual'] = 'purify' if spec.get('cleanse') else 'recover' if spec.get('heal') else 'ranged' if style == '원거리' else 'ultimate' if level >= 25 else 'sweep' if spec.get('aoe') else 'strike'
    return spec


EXCLUSIVE_SKILLS = {
    ('human', 'warrior'): {
        'hw_slash': skill('빠른 발도', 2, '근거리', range=2.3, damage=38, cooldown=3),
        'hw_bash': skill('방패 가격', 4, '근거리', range=2.1, damage=28, stun=1.5),
        'hw_cleave': skill('반월 참격', 6, '근거리', range=3.0, damage=45, aoe=True),
        'hw_aid': skill('전장 응급 붕대', 10, '회복', heal=38),
        'hw_judgment': skill('은검 심판', 15, '근거리', range=2.5, damage=90),
        'hw_quake': skill('대지 강타', 20, '근거리', range=3.2, damage=58, aoe=True, stun=2),
        'hw_sanctuary': skill('성역 정화', 25, '회복', heal=55, cleanse=60),
        'hw_execution': skill('여명의 처형검', 30, '근거리', range=2.8, damage=145, cooldown=24),
    },
    ('human', 'ranged'): {
        'hr_shot': skill('속사', 2, '원거리', range=4.8, damage=32, cooldown=3),
        'hr_shock': skill('전기 충격탄', 4, '원거리', range=5.2, damage=24, stun=1.2),
        'hr_grenade': skill('파편 수류탄', 6, '원거리', range=5.5, damage=40, blast_radius=2),
        'hr_medkit': skill('전술 의료 주사', 10, '회복', heal=32, cleanse=20),
        'hr_snipe': skill('장거리 철갑 저격', 15, '원거리', range=8, damage=82),
        'hr_flash': skill('섬광 유탄', 20, '원거리', range=6, damage=48, blast_radius=2.5, stun=1.5),
        'hr_rocket': skill('은제 로켓', 25, '원거리', range=6.5, damage=95, blast_radius=2.8),
        'hr_rail': skill('최종 결전탄', 30, '원거리', range=8.5, damage=135, cooldown=24),
    },
    ('vampire', 'warrior'): {
        'vw_rend': skill('핏빛 할퀴기', 2, '근거리', range=2.3, damage=34, leech_mult=.28, cooldown=3),
        'vw_grip': skill('목덜미 포획', 4, '근거리', range=2, damage=26, stun=1.6, leech_mult=.3),
        'vw_reap': skill('피의 수확', 6, '근거리', range=2.8, damage=40, aoe=True, leech_mult=.32),
        'vw_mend': skill('불사의 혈맥', 10, '회복', heal=42),
        'vw_fang': skill('심장 관통 송곳니', 15, '근거리', range=2.4, damage=84, leech_mult=.4),
        'vw_howl': skill('공포의 포효', 20, '근거리', range=3.0, damage=50, aoe=True, stun=2.2, leech_mult=.25),
        'vw_feast': skill('붉은 연회', 25, '근거리', range=3.4, damage=85, aoe=True, leech_mult=.4),
        'vw_king': skill('혈왕의 처형', 30, '근거리', range=2.6, damage=140, leech_mult=.45, cooldown=24),
    },
    ('vampire', 'ranged'): {
        'vr_bolt': skill('어둠의 혈탄', 2, '원거리', range=5, damage=30, leech_mult=.2, cooldown=3),
        'vr_bind': skill('핏빛 속박', 4, '원거리', range=5.5, damage=22, stun=1.5, leech_mult=.18),
        'vr_orb': skill('역병 구체', 6, '원거리', range=5.8, damage=36, blast_radius=2.2, leech_mult=.22),
        'vr_restore': skill('진홍빛 정화 의식', 10, '회복', heal=34, cleanse=30),
        'vr_lance': skill('밤의 관통창', 15, '원거리', range=7.5, damage=78, leech_mult=.3),
        'vr_prison': skill('혈옥 결계', 20, '원거리', range=6, damage=44, blast_radius=2.5, stun=2, leech_mult=.2),
        'vr_eclipse': skill('일식의 파동', 25, '원거리', range=6.5, damage=88, blast_radius=3, leech_mult=.3),
        'vr_doom': skill('종말의 혈성', 30, '원거리', range=7, damage=112, blast_radius=3.2, leech_mult=.3, cooldown=26),
    },
}



SPECIALIZATIONS={
 ('human','warrior'):{
  'hw_riposte':skill('개척검 반격',35,'근거리',range=2.8,damage=160,stun=1.2,cooldown=16,fx_family='cross',discipline='검술'),
  'hw_breach':skill('철벽 파쇄',45,'근거리',range=3.2,damage=125,aoe=True,stun=2,cooldown=22,fx_family='nova',discipline='제압'),
  'hw_rescue':skill('생존자의 맹세',60,'회복',heal=70,cleanse=80,cooldown=35,fx_family='sanctuary',discipline='생존'),
  'hw_dawn':skill('여명 검무',80,'근거리',range=3.8,damage=230,aoe=True,cooldown=40,fx_family='slash',discipline='검술'),
 },
 ('human','ranged'):{
  'hr_burst':skill('정찰 연속사격',35,'원거리',range=8,damage=155,cooldown=15,fx_family='volley',discipline='사격'),
  'hr_cluster':skill('집속 소이탄',45,'원거리',range=7.5,damage=135,blast_radius=3.2,cooldown=24,fx_family='bomb',discipline='폭파'),
  'hr_resupply':skill('전술 응급 처치',60,'회복',heal=65,cleanse=90,cooldown=35,fx_family='heal',discipline='생존'),
  'hr_piercer':skill('태양 관통탄',80,'원거리',range=10,damage=260,blast_radius=1.5,cooldown=40,fx_family='beam',discipline='사격'),
 },
 ('vampire','warrior'):{
  'vw_lacerate':skill('밤사냥 열상',35,'근거리',range=2.8,damage=150,leech_mult=.35,cooldown=16,fx_family='cross',discipline='혈조'),
  'vw_terror':skill('심연의 속박',45,'근거리',range=3.5,damage=115,aoe=True,stun=2.5,cooldown=24,fx_family='chains',discipline='공포'),
  'vw_rebirth':skill('불멸의 탈피',60,'회복',heal=75,cleanse=60,cooldown=35,fx_family='sanctuary',discipline='생존'),
  'vw_requiem':skill('혈왕 난무',80,'근거리',range=3.8,damage=220,aoe=True,leech_mult=.4,cooldown=40,fx_family='slash',discipline='혈조'),
 },
 ('vampire','ranged'):{
  'vr_spear':skill('진홍의 창',35,'원거리',range=8,damage=155,cooldown=16,fx_family='beam',discipline='혈마법'),
  'vr_storm':skill('묘역 뇌폭',45,'원거리',range=8,damage=130,blast_radius=3.2,stun=1.2,cooldown=24,fx_family='lightning',discipline='저주'),
  'vr_pact':skill('불사의 계약',60,'회복',heal=70,cleanse=80,cooldown=35,fx_family='sanctuary',discipline='생존'),
  'vr_moonfall':skill('혈월 낙하',80,'원거리',range=9,damage=240,blast_radius=3.5,cooldown=40,fx_family='orb',discipline='혈마법'),
 },
}
for key,specs in SPECIALIZATIONS.items():EXCLUSIVE_SKILLS[key].update(specs)

def register_skills(combat, jobs):
    for (species, job), specs in EXCLUSIVE_SKILLS.items():
        for key, spec in specs.items():
            spec.update(species=species, job=job, key=key)
            combat[key] = spec
            jobs[(species, job)][key] = spec


def configure_ranged_skills(jobs):
    """All offensive ranged skills cast at distant targets, never caster-centred."""
    for species in ('human','vampire'):
        for key,spec in jobs[(species,'ranged')].items():
            if not spec.get('damage'):
                continue
            spec['category']='원거리'
            spec['visual']='ranged'
            spec['range']=max(6.0,spec['range'])
            spec['aoe']=False
            if key=='sweep':spec.update(range=6.0,blast_radius=2.0)
            elif key=='ultimate':spec.update(range=8.0,blast_radius=3.0)
            elif key=='strike':spec['range']=6.5
            elif key=='ranged':spec['range']=8.0
            details=[f"사거리 {spec['range']:g} · 기본 피해 {spec['damage']}"]
            if spec.get('blast_radius'):details.append(f"원거리 대상 중심 반경 {spec['blast_radius']:g} 폭발")
            else:details.append('원거리 단일 대상 타격')
            if spec.get('stun'):details.append(f"적 행동 {spec['stun']:g}초 중단")
            if spec.get('leech_mult'):details.append(f"피해의 {round(spec['leech_mult']*100)}% 흡혈 (대상당 4~16)")
            spec['desc']=' · '.join(details)+'.'
