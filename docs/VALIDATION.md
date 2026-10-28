# 검증 기록 · 0.4.0

2026-10-27 (한국 시간) 클라우드 환경에서 실행했습니다.

- Python unittest **27개 통과**. 생활 루프·인증·실제 HTTP·재시작 복구에 더해 64×64 경계, 대각선 보폭, 4개 지역 자원 채집, 새 감염체 재생성, 기존 저장 자산·감염체 상태 보존, 원거리 아지트 이주를 검사했습니다. 원거리 제작·건설·강화·연구·전환·파견의 HTTP 요청 거절과 자원 보존도 통과했습니다.
- `public/app.js`, `public/world.js`, `public/gothic.js` 및 브라우저 검사 스크립트의 JavaScript 문법 검사 통과.
- 실제 클라이언트 컨트롤러 검사 통과: **도보/탑승 24개 목적지**, 채집, 화면 방향 입력, 버튼 포커스 후 이동, Esc·창 전환·일시정지 취소, 줌별 카메라 좌표 변환, 첫 생존 안내.
- Playwright + 실제 Chromium 검사 통과: 데스크톱 1440×1080 및 모바일 390×844 뷰포트에서 실제 Python 서버에 접속해 종족 선택, 화면 방향 이동, 클릭 채집, 아지트 귀환, 건설·제작·섭취, 소나무숲까지 원거리 이동·채집, 분류 메뉴·뒤로/닫기·포커스 복귀·제작 분류, 줌, 넓게 보기, 일시정지, 이동 취소와 터치 방향패드 해제를 검사했습니다. 아지트 내부에서만 관리/제작 메뉴가 보이고, 외부에서는 B 단축키로도 열리지 않으며, 모바일 귀환 후 다시 열리는 것을 확인했습니다. 가로 넘침 및 브라우저 JavaScript 오류 없음.
- 데스크톱 시작·아지트·제작·숲 화면과 모바일 보관품·제작·숲 화면의 스크린샷을 확인했습니다. 개인 저장 대신 임시 DB와 임시 키를 사용했습니다.
- 생성 PNG 3장 로딩과 PNG 응답, 아트 파일의 정적 허용 목록, 알 수 없는 이미지·경로 탐색 거절 검사를 통과했습니다. 실제 의료실 건설 후 인간→뱀파이어→인간 전환을 통해 초상 경로·이미지 로딩과 테마 변경을 확인했습니다.
- 시작 화면·인간 피난처·뱀파이어 생존 메뉴·숲·모바일 화면의 스크린샷을 확인했습니다.
- Markdown 내부 링크와 필수 문서 검사 통과.

## 재실행

저장소 루트에서:

```sh
python -m unittest discover -s tests -v
node --check public/app.js
node --check public/world.js
node --check public/gothic.js
node tests/client_navigation.cjs
python tools/check_docs.py
```

Playwright와 Chromium이 준비된 환경의 선택적 브라우저 검사:

```sh
node tests/browser_smoke.cjs
```

`CHROMIUM_PATH`로 브라우저 실행 파일을 지정할 수 있습니다. `BLOODFALL_SCREENSHOTS=/tmp/bloodfall-qa`를 지정하면 화면을 저장합니다. 테스트는 개발용 `data/`에 접근하지 않으며 임시 서버·저장을 정리합니다. 런타임 게임에는 Playwright나 npm 설치가 필요하지 않습니다.

## 검증 범위와 남은 항목

모바일 검사는 Chromium의 뷰포트·터치 에뮬레이션입니다. 실제 휴대전화, Safari/Firefox, 장시간 플레이·성능, 외부 네트워크·HTTPS는 검증하지 않았습니다. 지역의 나무·물가·폐허는 장식이며 충돌·길찾기·자유 건축·멀티플레이는 미구현입니다.

## 0.8.0 검증 (2026-10-27)

- `python -m unittest discover -s tests -v`: 46개 통과. 순찰 범위·추적/복귀·지역별 능력치·5등급 확률 경계·중복 드롭 방지·장비 공격/방어·이동 NPC 의뢰·저장 이전 및 HTTP 소유권/원자성 포함.
- `node tests/combat_inventory_browser.cjs`: 격리 저장으로 5등급 표시, 착용/해제 저장, NPC 이동, 정적 지형 캐시 유지, 소모품·Q/Space/R·모바일 화면 검증.
- `node tests/browser_smoke.cjs`: 데스크톱·모바일 실제 HTTP 이동/채집/아지트 제작·종족 전환·원거리 메뉴 제한 통과.
- `node tests/client_navigation.cjs`, `node tests/field_art.cjs`, `node tests/combat_effects.cjs`, 수정 JS 문법 및 문서 링크 검사 통과.
- `node tests/render_performance.cjs`: 이 클라우드 Chromium에서 아지트/숲/모바일 크기 화면의 draw 중앙값 0.4–0.5ms, 프레임 중앙값 약 16.7ms. 실제 모바일 기기 성능 보장은 아닙니다.
- 개인 저장은 로컬 백업 후 새 필드를 추가하고 재고·시설·강화·진행·쿨다운·기존 몬스터 HP/타이머의 보존과 재로딩을 확인했습니다. 개인 데이터 및 테스트 스크린샷은 커밋하지 않습니다.
