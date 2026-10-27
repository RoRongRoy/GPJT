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
