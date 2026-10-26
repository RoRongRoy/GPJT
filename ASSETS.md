# 자산 목록

0.4.0에서는 프로젝트용 신규 일러스트 3장과 직접 구성한 Canvas/CSS 아트를 함께 사용합니다. 시스템 폰트를 사용하며 외부 CDN·원작 게임 자산·음원에 의존하지 않습니다.

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
