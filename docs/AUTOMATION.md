# 자동 검사와 무료 서버 연결

## 현재 구성

GitHub push·PR마다 `.github/workflows/test.yml`이 서버 테스트, 클라이언트 이동/전투 검사, 실제 Chromium의 신규 접속·계정 불러오기·스킬창·모바일 HUD 검사를 실행합니다. 브라우저 검사 화면은 Actions의 `hud-screenshots` 아티팩트에 7일 보관합니다. `Ready to deploy`는 두 검사 작업이 모두 성공해야 통과합니다.

`main`에서 검사에 통과한 커밋만 연결된 Linux 서버에 배포합니다. 배포할 서버가 아직 없으면 배포 작업은 건너뜁니다. GitHub Actions 화면에서 수동 재실행도 가능합니다. main의 실행은 직전 배포가 끝날 때까지 기다리며 PR은 배포하지 않습니다.

## 호스팅 요금 없이 사용할 서버

이 게임에는 Python 서버가 필요하므로 GitHub Pages만으로는 실행할 수 없습니다. Render 무료 사용량을 소진했다면 배포 스크립트를 바꾸는 것만으로 사용량이 복구되지 않습니다.

우선 후보는 [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/)의 Ubuntu VM입니다. 가입 인증, 계정별 제공 조건, 선택 지역의 무료 인스턴스 가용 여부를 가입 화면에서 확인해야 합니다. **Always Free eligible**로 표시된 자원만 선택하고 유료 자원·계정 업그레이드는 하지 않습니다. 이 저장소는 클라우드 자원을 생성하거나 유료 요금제로 전환하지 않습니다. 무료 VM을 확보하지 못하면 Linux PC 또는 Windows의 Ubuntu/WSL2에서 같은 구성을 사용할 수 있습니다. PC와 Docker, 배포 실행기는 켜져 있어야 합니다.

무료 클라우드의 계속 제공이나 가입 성공은 보장할 수 없습니다. GitHub 비공개 저장소의 호스팅 실행기에도 무료 이용 한도가 있으므로 Actions 결제 설정의 예산·초과 사용 차단을 확인하세요. 예약 반복 실행은 추가하지 않았습니다.

참고로 [Hugging Face의 현재 공식 Spaces 문서](https://github.com/huggingface/hub-docs/blob/main/docs/hub/spaces-overview.md)는 Docker Space 신규 생성에 유료 플랜이 필요하다고 안내하므로 이번 무료 서버 대안에서 제외했습니다.

## 서버 확보 후 한 번만 연결

1. Ubuntu 서버에 [Docker Engine과 Compose 플러그인](https://docs.docker.com/engine/install/ubuntu/)을 설치합니다. 배포 실행기 사용자가 `docker info`와 `docker compose version`을 실행할 수 있어야 합니다.
2. GitHub 저장소 → **Settings → Actions → Runners → New self-hosted runner**에서 Linux와 VM의 아키텍처(x64 또는 ARM64)를 선택합니다. 표시된 설치·등록 명령을 해당 서버에서 실행하고 사용자 지정 라벨 **bloodfall**을 추가합니다. 등록 토큰을 채팅이나 저장소에 올리지 마세요. 실행기는 서비스로 설치해 재부팅 후에도 시작되도록 합니다.
3. **Settings → Secrets and variables → Actions → Variables**에 다음 저장소 변수를 설정합니다.

   | 변수 | 값 | 의미 |
   | --- | --- | --- |
   | `BLOODFALL_AUTO_DEPLOY` | `true` | 서버 연결 후 자동 배포 활성화 |
   | `BLOODFALL_BIND` | 기본 `127.0.0.1` | 로컬 프록시/터널로 접속. VM 외부 직접 접근이 필요한 경우 `0.0.0.0` |
   | `BLOODFALL_PORT` | 기본 `8080` | 호스트의 게임 포트 |

4. Actions → **Game checks → Run workflow**, branch `main`으로 첫 배포를 실행합니다. 이후 main에 올리는 변경은 테스트를 통과하면 자동 반영됩니다.
5. 기본 상태는 해당 서버에서 `http://127.0.0.1:8080`으로 접속합니다. 외부 공개 URL은 서버의 프록시/터널 또는 VM 네트워크 설정을 별도로 연결해야 합니다. [외부 접속 안내](DEPLOYMENT.md)를 참고하세요. 이 설정 자체는 도메인·방화벽·유료 서비스를 만들지 않습니다.

서버 이름이나 VM 주소만으로 실행기를 대신 등록할 수는 없습니다. 현재 환경에서는 서버 계정과 GitHub 관리 API에 접근할 수 없어 실행기 등록과 저장소 변수 활성화를 자동으로 마치지는 못했습니다.

## 업데이트와 저장

`tools/deploy_game.sh`는 해당 커밋의 컨테이너 이미지를 먼저 빌드하고, 기존 SQLite 저장을 일관된 스냅샷으로 백업한 뒤 게임을 교체합니다. 새 컨테이너의 HTTP 건강 검사가 통과해야 배포 성공으로 처리합니다. 실패하면 이전 이미지로 돌아가기를 시도하고 Actions를 실패 처리합니다. 저장 데이터는 자동으로 이전 시점으로 되돌리지 않습니다.

- `bloodfall_saves` 볼륨: 월드, 계정 DB, 접속 키. 코드 업데이트·컨테이너 재생성 후에도 유지.
- `bloodfall_backups` 볼륨: 배포 직전 SQLite 백업. 운영 중 용량을 확인하고 별도 장치에도 복사하세요.
- `docker compose down -v`는 저장 볼륨을 삭제하므로 사용하지 않습니다.
- 다른 호스팅으로 바꿀 때는 Render의 기존 SQLite 저장을 별도로 이전해야 합니다. 새 서버가 기존 계정을 자동으로 가져오지는 않습니다.

VM 삭제나 디스크 손실까지 Docker 볼륨이 보호하지는 않습니다. 컨테이너 로그·접속 키·개인 저장 파일은 CI 아티팩트에 올리지 않습니다.

## 로컬 검사

```sh
npm ci
npx playwright install --with-deps chromium
python -m unittest discover -s tests -v
npm test
python tools/check_docs.py
```

이미 설치된 Chromium을 쓰려면 `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`처럼 실행합니다. 배포 스크립트는 Linux Bash, Docker, Compose v2가 필요하며 서버에만 실행합니다.
