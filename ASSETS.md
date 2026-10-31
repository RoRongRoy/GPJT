# 자산 목록

0.5.0에서는 메뉴 일러스트 3장, 인게임 PNG 11장과 Canvas/CSS 합성을 사용합니다. 시스템 폰트를 사용하며 외부 CDN·원작 게임 자산·음원에 의존하지 않습니다.

## 이미지 원본

제작일: 2026-10-27 (한국 시간). 제작 도구: 이 작업의 `image_gen`. 출처: BLOODFALL 전용 텍스트 프롬프트로 새로 생성. 입력 레퍼런스 이미지·다크에덴 원본 파일은 사용하지 않았습니다.

| 파일 | 크기 | 용도 | 수정 |
| --- | --- | --- | --- |
| [human-warden.png](public/art/human-warden.png) | 1024×1536, 2,683,691 bytes | 인간 종족 선택·생존자 초상 | 원본 PNG 유지; 화면에서 CSS 배치 |
| [nightfall-city.png](public/art/nightfall-city.png) | 1536×1024, 2,587,825 bytes | 시작 화면 배경·아지트 삽화 | 원본 PNG 유지; 화면에서 CSS 배치 |
| [vampire-scholar.png](public/art/vampire-scholar.png) | 1024×1536, 2,354,682 bytes | 뱀파이어 종족 선택·생존자 초상 | 원본 PNG 유지; 화면에서 CSS 배치 |

## 무결성 기록

| 파일 | SHA-256 |
| --- | --- |
| human-warden.png | `955f4376000f55ba98a8bf80ad0f4221fc8e6f94e1e1e0651a3725b5426b8145` |
| nightfall-city.png | `3653af968f046d863c400d3088a9a129a9b446885e130fc248097ead730d0a47` |
| vampire-scholar.png | `6d0b6398eadfbc58bce05bc838c8a8d460c2461010b15c352fd2404a4dab1598` |

## 코드로 구성한 아트

- [gothic.js](public/gothic.js): 피난처·폐허·식생·가스등·시설·캐릭터 도형과 분위기 효과.
- [world.js](public/world.js): 지도·카메라·렌더링·미니맵 통합.
- [gothic.css](public/gothic.css): 고딕 색상·프레임·일러스트 배치.

이용 정책은 기존 [LICENSE_POLICY.md](LICENSE_POLICY.md)를 따르며 이 문서는 공개 재사용 라이선스를 부여하지 않습니다. 새 이미지는 AI 생성물로 기록하며 사람 작가의 그림이나 원작 공식 아트라고 표시하지 않습니다. 아트 교체 시 파일명·제작자/도구·출처·이용 조건·수정 내역을 갱신합니다.

참고 방향과 실제 구현 범위는 [ART_DIRECTION.md](docs/ART_DIRECTION.md)에 설명합니다.

## 0.5.0 인게임 원본

제작일: 2026-10-27 (한국 시간). 제작 도구: `image_gen`. 모두 BLOODFALL 전용 텍스트 설명으로 생성했으며 나무·폐허는 생성한 자체 이미지를 같은 도구로 투명 배경 보정했습니다. 외부 게임 원본은 사용하지 않았습니다. PNG는 수정·재인코딩 없이 보관합니다.

| 파일 | 크기 | SHA-256 |
| --- | --- | --- |
| [brute.png](public/art/gameplay/brute.png) | 1254×1254, 1,589,317 bytes | `a7c500f1877bbb589e5d65ac3375f5c135f2f62a37cd2208086caca0396c7da9` |
| [dead-tree.png](public/art/gameplay/dead-tree.png) | 1024×1536, 2,709,172 bytes | `4db9f263b87c04dde1fda6b2251390794ae62e36969e80d6a98001aacd0264c3` |
| [earth.png](public/art/gameplay/earth.png) | 1254×1254, 4,474,498 bytes | `e2203d78d5a6d1f0ad408e59bd84505f57519c5eff54d1016fae0ca24f6a2d89` |
| [ghoul.png](public/art/gameplay/ghoul.png) | 1254×1254, 1,334,739 bytes | `06103b107373db31df2a2defa909b4ed32e98ef1e9ebcdb2e308710e501996a7` |
| [human.png](public/art/gameplay/human.png) | 1254×1254, 1,229,234 bytes | `81f0a7ed2a6abfd855f408c66f47d043d7ca100bc50f437e9eccb3c27e94fd74` |
| [pine.png](public/art/gameplay/pine.png) | 1024×1536, 2,796,814 bytes | `a291f16f3555bcc832eeb126c50c6d86f4879035e95f02431bfa8e952f430171` |
| [props.png](public/art/gameplay/props.png) | 1774×887, 2,107,784 bytes | `aa8c963061bfcaa39ef88bf31e5dacc123605cbe8b93c89d39e383922131c6ae` |
| [refuge.png](public/art/gameplay/refuge.png) | 1254×1254, 2,440,559 bytes | `a0779fb17e9957f568c58d6439c9b7e0078cb675cbf2b7664684362208d4ea88` |
| [ruin.png](public/art/gameplay/ruin.png) | 1536×1024, 2,676,249 bytes | `fd42a75a77ca0b9eb0cbb08bf0f7191a065a4eeb607a019f2246085e2cead6dc` |
| [stone.png](public/art/gameplay/stone.png) | 1254×1254, 4,175,424 bytes | `ebe5b6af2a32ada93c5cf6033dff3bde4868013fc7454b67e6fde1bee8042f56` |
| [vampire.png](public/art/gameplay/vampire.png) | 1254×1254, 1,342,458 bytes | `602a6615c896167c6a5e55e443be0c02ca453d930d7b53e596442e2b472138ba` |

인간·뱀파이어·감염체 2종은 4×4 시트, props는 우물/폐트럭/보급소/가스등과 주방/연금대/의료실/저장고 8종 시트입니다. 프레임 경계는 알파 영역을 읽어 검토했고 원본 이미지 파일을 자르지 않았습니다. 생성 시트의 중복 후면 방향은 런타임 좌우 반전으로 보완합니다.

## 0.6.0 UI 아이콘과 전투 연출

`public/icons/`의 wood/water/crop/herb/blood/metal/scroll/soup/elixir/medicine.svg 10종은 이번 작업에서 직접 작성한 SVG 도형입니다. 외부 아이콘 라이브러리·게임 이미지를 복사하지 않았습니다. [combat.js](public/combat.js)는 기존 스프라이트의 변환, 무기 궤적, 입자, 피해·회복 숫자를 합성합니다. 신규 공격용 이미지 시트나 외부 음원은 포함하지 않습니다. 기존 라이선스 정책을 유지합니다.

0.8.0: `public/icons/weapon.svg`, `armor.svg`는 프로젝트에서 직접 작성한 검·방호복 인벤토리 아이콘입니다. 외부 게임 이미지를 사용하지 않았습니다.

## Resource economy icons (2026-10-30)

`public/icons/`에 건설 자재 32개·전투 재료/주문서 15개용 자체 작성 SVG 아이콘 47개를 추가했습니다. 코드로 작성한 기하 도형과 색상을 사용하며 외부 게임 이미지를 포함하지 않습니다.

## 2026-10-31 · Nocturne 환경과 몬스터 아트

제작 도구: `image_gen`. BLOODFALL 전용 텍스트 설명으로 생성했으며 건물/야외 시트의 배치·투명 배경 보정에는 같은 도구를 사용했습니다. 생성된 PNG는 원본 그대로 보관하고 브라우저에서 검토한 소스 사각형을 샘플링합니다. 웹의 다크에덴 자료는 분석용으로만 열었고 외부 게임 원본·로고·코드는 포함하지 않았습니다.

| 파일 | 크기 | bytes | SHA-256 |
| --- | --- | --- | --- |
| [settlements.png](public/art/gameplay/settlements.png) | 1254×1254 | 2,281,428 | `41f3e4eef06d790d659723c46f1463b8638fc06ebc8feaea9ca9fce6f25e7864` |
| [wasteland.png](public/art/gameplay/wasteland.png) | 1536×1024 | 2,541,857 | `50f8174834f43a0de194ac695cb137426f09413aea6d8221097c2643a8be5fc4` |
| [surfaces.png](public/art/gameplay/surfaces.png) | 1254×1254 | 4,111,904 | `d51d26ab7db343deba6e03961ced59700bc72eb646329f321b7f579f25209fca` |
| [grave-hound.png](public/art/gameplay/grave-hound.png) | 1331×1182 | 1,813,202 | `69c3d8c28cbb5b3be1ff8a9d80362c55c4bfec97c81b181909260281dcf27eb7` |
| [iron-revenant.png](public/art/gameplay/iron-revenant.png) | 1240×1269 | 1,683,769 | `7bf20e21492435d8f83fcce8362933050221e3e0bbb5ea483a0a8cb3a0fa8b79` |

`settlements`는 군용/고딕 구조물 12종, `wasteland`는 폐건물·차량·비노골적인 덮인 유해·광석·고목·침엽수·묘지·가로등 8종, `surfaces`는 포석·흙·아스팔트·석판 4종입니다. `grave-hound`와 `iron-revenant`는 각각 4방향 × 이동 4프레임이며 기존 몬스터 유형의 표현에 연결됩니다. 기존 이용 정책을 유지합니다.

## 2026-10-31 · 파밍 오브젝트 아틀라스

[salvage.png](public/art/gameplay/salvage.png): 1402×1122 RGBA, 독립 실루엣 20종. `image_gen`으로 새로 생성했으며 원본 PNG를 수정하지 않고 런타임 프레임 영역으로 표시합니다. SHA-256: `63a83c220570575f805bdb02db71f06738ec9e72c32618f6d57515d2b6601022`. 원작 이미지 파일은 사용하지 않았습니다.

## 2026-10-31 · 종족 이동수단

[mounts.png](public/art/gameplay/mounts.png): 1536×1024 RGBA. 정찰 오토바이·장갑 험비·혈익 박쥐·거대 혈익 박쥐, 각 4방향 총 16프레임. `image_gen`으로 생성한 원본을 유지하고 알파 실루엣 영역을 런타임에 샘플링합니다. SHA-256: `03fcebd87d81721e44937457b2bcb2e320eb9f257d7077c7b88f3326fa2f2c07`. 원작 게임 파일을 사용하지 않았습니다.

## 2026-10-31 · 스킬 이펙트

[skill-fx.png](public/art/gameplay/skill-fx.png): 1448×1086 RGBA, 참격·혈조·총구 섬광·폭발·전격·혈탄·속박·회복진·성광·유성·충격파·일식 12종. `image_gen` 신규 원본 유지, 프레임별 런타임 샘플링 및 광원 합성. SHA-256: `2189cc0279a96cdcf730a3947381f0d6d95d256b86dbd63ad84d9f6555e83ea5`.
