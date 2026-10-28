# API · prototype 0.8.0

정적 경로: `/`, `/app.js`, `/world.js`, `/gothic.js`, `/style.css`, `/gothic.css`, `/art/nightfall-city.png`, `/art/human-warden.png`, `/art/vampire-scholar.png`. 스프라이트/전투 스크립트, 게임플레이 PNG, 소모품 아이콘과 무기·방어구 SVG도 `server/main.py`의 명시적 허용 목록으로 제공합니다. 디렉터리 전체를 공개하지 않습니다.

API 공통 헤더: `X-Access-Key`(서버 키), `X-Session-ID`(탭별 16~100자), `Content-Type: application/json`. 키는 URL fragment에서 sessionStorage로 읽고 주소 표시줄에서 제거합니다. TLS 없이는 헤더도 암호화되지 않습니다.

## GET /api/state

응답 `{world, pois, items, map, recipes, combat, rarities}`. `map`은 서버 소유의 `size`(128), `layout_version`(2), `regions`(중심 x/y·radius·이름·색), `roads`(굽은 길의 제어점 배열), `base_radius`(아지트 이용·보호 반경 7), `base_clear_radius`(장식 비우기 반경 9), `movement`(기본 보폭 0.48, 최소 간격 0.08초, 탑승 배율)입니다. 클라이언트는 이 데이터로 지도 경계와 이동 안내를 계산합니다. `recipes`는 조합식별 이름·필요 시설·비용을 제공합니다. UI의 아지트 접근 표시와 제작 조건은 이 데이터를 사용하지만 서버가 실행 시 거리·시설·재료를 다시 검증합니다. 조회는 세션 임대를 갱신합니다. 클라이언트는 400ms 간격으로 조회하되 숨김 탭에서는 멈춥니다. 인증 실패 401, 다른 활성 세션 409.

## POST /api/action

본문 예:

```json
{"revision":0,"command":{"action":"choose","species":"human"}}
```

성공 응답은 전체 상태. 성공한 명령 revision이 증가합니다. 클라이언트는 응답을 확인한 뒤 다음 명령을 보냅니다. 요청 유실 시 상태를 다시 조회하고 사용자가 재시도합니다. 이전 revision 자동 재전송 금지.

| action | 추가 필드 | 검증/효과 |
| --- | --- | --- |
| choose | species: human/vampire | 최초 1회 |
| move | dx,dy: -1/0/1 정수 | 0.08초 제한, 서버 보폭 0.48·좌표 1~126 경계 |
| gather | id: POI ID | 거리 2 이내, 지점별 3초 |
| craft | recipe: soup/elixir/medicine | 아지트·시설·재료 검증 |
| consume | item | 재고·종족 검증 |
| equip | item: 소유 장비 ID | 서버 소유권 확인 후 부위별 장비 교체 |
| unequip | slot: weapon/armor | 착용 해제, 가방에 보존 |
| build | facility: kitchen/alchemy/medical/storage | 아지트, 단계별 목재·부품 |
| relocate | 없음 | 현재 위치, 적/POI 겹침 제한 |
| enhance | 없음 | 아지트·주문서·상한·실패 보정 |
| attack | 없음 | 거리 2.1 이내 최근접 좀비, 하차 상태 |
| quest | 없음 | NPC 거리 2.5, 채집 5회 |
| dispatch | 없음 | 아지트, 파견 중복 금지 |
| convert | 없음 | 아지트·의료실·약초·물 |
| research | 없음 | 아지트·재료, 현재 종족 단계 +1 |
| mount | 없음 | 해금·위협·소모 자원 |
| rescue | 없음 | HP≤30 또는 감염≥60 |
| pause | 없음 | 월드 정지 토글 |

오류 JSON은 `{error: string}`. 400 규칙/형식 오류, 401 키 오류, 404 경로 없음, 409 임대/revision 충돌, 429 최소 요청 간격 60ms 위반. 본문 4KB 제한. 숫자 좌표나 아이템 수를 임의로 제출하는 API는 없습니다. CORS 허용 헤더를 내보내지 않습니다.

현재 서버는 세션별 플레이어 프로필과 계정 저장/불러오기를 지원합니다. 이동 입력도 해당 세션의 프로필에만 적용합니다.

0.8.0: `pois`의 NPC 좌표는 현재 순찰 위치이며 `home_x/home_y`는 거점입니다. `map.regions[].levels`는 권장 레벨 범위, `rarities`는 등급별 이름·색·처치당 절대 장비 확률·추가 능력치입니다. `world.gear`는 고유 장비 목록, `equipment`는 부위별 착용 ID입니다. 장비 지급·확률·경험치는 서버에서만 결정하고 클라이언트가 수치나 아이템을 생성하는 명령은 없습니다.

## POST /api/input · Socket.IO input

본문 `{"seq":1,"dx":1,"dy":0,"sprint":false}`. HTTP에서는 기존 인증·세션 헤더와 4KB 제한을 사용하고, Socket.IO에서는 `input` 이벤트로 전송합니다. `seq`는 세션별 증가하는 양의 정수(<2^53), `dx/dy`는 -1/0/1 정수, `sprint`는 생략 가능한 boolean입니다. (0,0)은 정지입니다. 중복·역순 입력은 무시합니다.

패킷 수가 아닌 서버 단조 시간으로 거리·탑승 소모를 계산합니다. 기본 0.48 / 0.08초 = 6칸/초, 달리기 1.65배, 탑승 질주 1.25배이며 대각선 정규화·지도 경계·자동 하차 규칙을 적용합니다. 마지막 입력은 0.4초 뒤 만료됩니다. 단일 `move`와 연속 입력을 섞어 속도를 중복 가산할 수 없습니다. 입력 자체는 revision을 올리지 않으며 결과 좌표는 기존 주기 저장에 포함됩니다. 누른 키 상태는 재시작 후 복구하지 않습니다.

HTTP 응답과 상태의 `movement` 필드: `{enabled,seq,dx,dy,sprint,age,lease}`. `age`는 마지막 이동 계산 후 경과 초, `lease`는 0.4초입니다. Socket.IO 확인 응답은 `{ok,input,status,error}`입니다. 상태에는 `snapshot_time`(UTC epoch 초)도 추가해 지연된 상태로 화면 좌표가 되돌아가지 않게 합니다. 화면 예측은 서버 확인 위치 주변으로 제한합니다.

`/api/action`의 `command.input_seq`에는 마지막으로 보낸 이동 순번을 넣습니다. 행동 처리 전에 이 순번까지의 이동을 정지해 뒤늦은 입력이 공격·메뉴 조작 이후 다시 걷게 만들지 않습니다. 응답 유실 시 일반 행동을 자동 재전송하지 않고, 상태 조회와 순번이 있는 이동 입력만 다른 전송 방식으로 재시도합니다.
