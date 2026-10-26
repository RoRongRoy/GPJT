# API · prototype 0.3.0

정적 경로: `/`, `/app.js`, `/world.js`, `/style.css`. 이 외 파일 경로는 공개하지 않습니다.

API 공통 헤더: `X-Access-Key`(서버 키), `X-Session-ID`(탭별 16~100자), `Content-Type: application/json`. 키는 URL fragment에서 sessionStorage로 읽고 주소 표시줄에서 제거합니다. TLS 없이는 헤더도 암호화되지 않습니다.

## GET /api/state

응답 `{world, pois, items, map}`. `map`은 서버 소유의 `size`(64), `regions`(영역·이름·색), `movement`(기본 보폭 0.48, 최소 간격 0.10초, 탑승 배율)입니다. 클라이언트는 이 데이터로 지도 경계와 이동 안내를 계산합니다. 조회는 세션 임대를 갱신합니다. 클라이언트는 400ms 간격으로 조회하되 숨김 탭에서는 멈춥니다. 인증 실패 401, 다른 활성 세션 409.

## POST /api/action

본문 예:

```json
{"revision":0,"command":{"action":"choose","species":"human"}}
```

성공 응답은 전체 상태. 성공한 명령 revision이 증가합니다. 클라이언트는 응답을 확인한 뒤 다음 명령을 보냅니다. 요청 유실 시 상태를 다시 조회하고 사용자가 재시도합니다. 이전 revision 자동 재전송 금지.

| action | 추가 필드 | 검증/효과 |
| --- | --- | --- |
| choose | species: human/vampire | 최초 1회 |
| move | dx,dy: -1/0/1 정수 | 0.10초 제한, 서버 보폭 0.48·좌표 1~62 경계 |
| gather | id: POI ID | 거리 2 이내, 지점별 3초 |
| craft | recipe: soup/elixir/medicine | 아지트·시설·재료 검증 |
| consume | item | 재고·종족 검증 |
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

현재 API는 사용자별 로그인 API가 아니며 하나의 개인 월드만 제어합니다. 인터넷 전체에 접근 키를 공유하지 마세요.
