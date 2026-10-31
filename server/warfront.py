"""Faction environment names and additive outer regions."""
REGIONS=[
    dict(id='barrens',name='폐허 검문 지대',subtitle='철조망과 폐군수 차량이 남은 전선',x=464,y=80,radius=106,color='#626352',levels=[20,35],terrain='outskirts'),
    dict(id='siege',name='포위된 병참선',subtitle='버려진 보급소와 무너진 방어진지',x=464,y=240,radius=106,color='#606950',levels=[40,55],terrain='works'),
    dict(id='nightwall',name='밤의 외성',subtitle='고딕 성곽과 박쥐 동굴의 경계',x=464,y=440,radius=106,color='#5b415e',levels=[80,100],terrain='marsh'),
    dict(id='gravefields',name='안개 공동묘지',subtitle='비석과 납골묘가 남은 옛 영지',x=80,y=464,radius=106,color='#635866',levels=[25,40],terrain='forest'),
    dict(id='blackwood',name='검은 첨탑 숲',subtitle='버려진 성채로 이어지는 음산한 숲',x=240,y=464,radius=106,color='#3e5150',levels=[50,70],terrain='forest'),
    dict(id='bloodroad',name='혈석 순례로',subtitle='심연 성채를 향하는 붉은 제단의 길',x=360,y=464,radius=82,color='#69414c',levels=[75,95],terrain='marsh'),
]
FACILITY_THEMES={
 'human': dict(zip(['kitchen','alchemy','medical','storage','forge','tailor','jeweler','workshop','greenhouse','purifier','bloodbank','archive'],
                  ['야전 취사 텐트','군용 화학 실험실','의무 천막','보급 물자 창고','병기 정비고','전투복 공방','군용 인장 공방','차량 정비소','위장 온실','야전 정수장','혈청 보관소','작전 기록실'])),
 'vampire': dict(zip(['kitchen','alchemy','medical','storage','forge','tailor','jeweler','workshop','greenhouse','purifier','bloodbank','archive'],
                    ['혈족 연회당','금단의 연금탑','재생의 납골묘','지하 보물고','혈철 대장간','밤의 의복실','혈석 세공소','고대 장치실','독초 정원','암흑 우물','피의 성소','금서 서고']))
}

FACILITY_THEMES['human']['mobility']='차량 개조고'
FACILITY_THEMES['vampire']['mobility']='혈익 사육장'
