# P7 운영 연결과 배포

## 구현과 실제 운영의 구분

예약은 WITA 07:17/19:17 수집, 20:17 seal이다. 모든 수집·seal 후 동일 trusted chain에서 공식 D+1 대조를 실행한다. 관측 push entrypoint는 검증한 full commit SHA의 workflow와 코드를 함께 고정한다. GITHUB_TOKEN의 후속 push 이벤트에 의존하지 않는다. 관측 이외 snapshot·seal·validation 경로는 entrypoint를 재호출하지 않는다.

공식 비교 JSON은 `validation/d1/<WITA 날짜>/<input hash>.json`에 불변 저장한다. 당시 seal·receipt·confirmation·원 artifact hash·실제 저장 시각·모델 cutoff를 확인한다. 다른 observer/rubric의 PCI와 baseline을 섞지 않는다. Overall만 평가하며 Peak는 사용하지 않는다. 기록 수정은 새 comparison을 만들고 철회·날짜 이동은 이전 날짜의 현재 평가를 비운다. 과거 Git 이력은 남는다.

다이빙의 중간 시각과 가장 가까운 저장된 60분 예측 슬롯을 선택한다. 중간 시각 차이는 15분 이하, Site/Zone/대표 수심은 같아야 한다. 60분 초과 다이빙·출수 누락·맞는 슬롯 없음은 제외 사유로 남긴다. 가장 가까운 슬롯의 PCI가 null이면 다른 숫자 슬롯을 찾지 않는다. 실제 다이빙 구간과 60분 구간의 근사 대조이며 순간 유속·안전 판정이 아니다.

원본 SHA-256·설정·scaler identity·gate 상태는 정확히 검증한다. Linux/macOS 수학 라이브러리 차이는 재생 숫자에만 absolute/relative 1e-12 허용한다. 원본 저장 바이트나 과거 예측을 수정하지 않는다. 큰 차이·구조·문자열·상태 차이는 거부한다.

## GitHub 운영 설정

GitHub 운영 설정에는 별도 인증이 필요하며 저장용 PAT는 운영 설정 권한을 제공하지 않는다. 저장용 PAT에 Administration/Workflows 권한을 추가하지 않는다. SSH 코드는 기존 인증으로 push할 수 있다. 정책 설정과 수동 Actions 실행은 운영자 gh 인증을 갱신한다.

```sh
gh auth login -h github.com --web --scopes repo,workflow
python3 ops/configure_github.py
python3 ops/configure_github.py --apply
```

첫 명령은 운영자가 브라우저에서 승인한다. 설정 도구는 main에 PR/CI, main/data에 삭제·force push 차단, environment에 main/data branch 선택을 설정한다. 기존 reviewer/wait timer는 보존한다. 예상 밖 environment branch/tag 정책이 남으면 출력 목록을 확인해 Settings에서 정리한다. 이후 main 변경은 CI를 통과한 PR로 반영한다. 저장용 PAT는 data의 non-force Contents 쓰기에 사용한다.

`environmental-data`의 기존 Secret은 재사용한다. 값은 채팅·명령 인수로 전달하지 않는다.

| 구분 | 이름 / 값 |
|---|---|
| Environment Secrets | DATA_WRITE_TOKEN, COPERNICUSMARINE_SERVICE_USERNAME, COPERNICUSMARINE_SERVICE_PASSWORD |
| Environment Variables | MODEL_OBSERVER_ID=`bunaken-observer-01`, MODEL_RUBRIC_VERSION=`pci-overall-v1`, OPEN_METEO_USAGE_MODE=`noncommercial` |
| 불필요 | Open-Meteo API key, hosted runner용 AVISO 계정·원 atlas |

현재 pin은 `c84cb9a99036be44b36a0bc73417cb119371bedc`이다. main 예약과 data entrypoint는 이 full SHA를 함께 사용한다. 고정 pin 설치·예약 활성화 상태를 원격에서 확인한다. required reviewer를 설정한 경우 운영 수집을 검수한 후 자동 예약 승인 정책을 결정한다. API가 401/403이면 이름만 기록하고 인증/권한을 운영자가 처리한다. 등록한 Secret 값을 조회·출력하지 않는다.

## Vercel 최초 등록

1. Vercel에 로그인한 뒤 **Add New → Project → Import Git Repository**에서 공개 저장소 `taevel02/bunaken-current-observatory`를 선택한다.
2. Framework는 Next.js, Root Directory는 `apps/web`, Production Branch는 `main`, Node.js는 `24.x`를 선택한다. monorepo의 root/packages/config/docs 파일을 빌드에 포함한다.
3. `apps/web/vercel.json`의 frozen pnpm 설치·build 설정을 사용한다. data의 Root Directory에도 `ops/workflows/data-vercel.json`을 `apps/web/vercel.json`과 루트 `vercel.json`으로 설치하여 자동 배포를 비활성화한다. main 설정만으로 source 없는 data branch의 배포 차단이 확인됐다고 주장하지 않는다. 외부 PR build에는 production Secret을 제공하지 않는다. preview/development 관리자 기능은 서버에서도 차단한다.
4. Next.js 로컬 dotenv의 hash escape를 Vercel에 복사하지 않는다. ADMIN_PASSWORD_HASH는 원래 $argon2id$… 값이며 backslash·따옴표를 포함하지 않는다. 아래 서버 변수는 **Production만** 선택해 등록한다. 기존 로컬 파일 값을 복사하되 공개 observer와 로그인 ID를 구분한다.
5. 프로젝트가 정한 production HTTPS URL을 `CANONICAL_ORIGIN`으로 등록한다. 끝 `/`·path·query 없이 `https://<실제 호스트>` 형식이다. 처음 배포에서 설정이 없으면 관리자는 차단된다. URL 등록 후 production 재배포한다.

| Production 변수 | 설정 |
|---|---|
| ADMIN_ENABLED | true |
| ADMIN_USERNAME / ADMIN_PASSWORD_HASH / ADMIN_AUTH_VERSION | 기존 관리자 설정, encoded Argon2id hash 그대로 |
| SESSION_SECRET / IDEMPOTENCY_SECRET | 각각 별도의 32-byte base64url key |
| PUBLIC_OBSERVER_ID | 실제 공개 observer 별칭 |
| GITHUB_OWNER / GITHUB_REPO / GITHUB_DATA_BRANCH | taevel02 / bunaken-current-observatory / data |
| GITHUB_WRITE_TOKEN | 선택 저장소 Contents 쓰기 fine-grained PAT |
| CANONICAL_ORIGIN | 실제 production HTTPS origin |

웹에 Copernicus·AVISO 비밀번호를 넣지 않는다. NEXT_PUBLIC 이름으로 관리자·token·secret을 등록하지 않는다. 환경변수 변경은 production 재배포 후 확인한다.

로컬에서 production 값의 형식만 확인하려면 다음을 실행한다. 값 자체는 출력하지 않는다.

```sh
node --conditions=react-server --env-file=.local/production.env apps/web/scripts/check-production-env.mjs
```

localhost origin이면 이 검사는 의도적으로 실패한다. 실제 HTTPS origin과 Production 설정을 등록한 뒤 확인한다.

## WAF·Origin·옛 배포

[로그인 WAF 규칙](vercel-waf.ko.md)에 따라 `/api/auth/login` POST에 IP별 5분 10회, 초과 429를 게시한다. 기능 제공 범위는 실제 Vercel 계정에서 확인한다. 앱 메모리 counter로 대체하지 않는다.

```sh
node apps/web/scripts/production-smoke.mjs https://<실제 production 호스트>
node apps/web/scripts/production-smoke.mjs https://<실제 production 호스트> --rate-limit
```

rate-limit 검사는 승인한 새 테스트 IP에서 별도로 실행한다. 일반 smoke의 POST도 제한에 포함되므로 같은 IP라면 5분 뒤 실행한다. 1~10번째는 제한되지 않고 11번째가 429여야 통과한다. CSRF 200·token 형식·cookie·private/no-store도 검사한다. cookie·token·IP는 출력하지 않는다.

옛 deployment URL은 Dashboard에서 관리자 접근을 막는다. 이전 Secret 유출 가능성이 있으면 해당 배포를 중지하고 production auth version/session key를 바꿔 재배포한다. 새 코드가 배포되지 않은 옛 서버의 세션까지 자동 철회한다고 주장하지 않는다.

## 백업·성능

```sh
git fetch origin main data
python3 ops/backup_restore.py --output .local/backups/<새 이름>.bundle
python3 ops/performance_report.py --input .local/production-measurements.json
```

백업은 fetch한 origin/main·origin/data와 로컬 main commit을 함께 보존하고 모든 tracked blob을 검증한다. fetch하지 않은 로컬 main을 최신 production code로 간주하지 않는다. 임시 mirror에 복원해 fsck·ref 동일성·관측/snapshot/seal/web 파일 수를 확인한다. 작업 트리·ignored `.env`·원 atlas는 포함하지 않는다. 이미 존재하는 bundle은 덮어쓰지 않는다.

측정 입력 형식은 `ops/production-measurements.example.json`이다. 실제 성공한 저장 요청의 Network duration, 관측 저장 성공부터 공개 반영까지의 시간, 모바일 LCP를 기록한다. 저장 p95 목표 10초, 공개 반영 5분, 모바일 LCP 2.5초다. 비어 있으면 null/미측정으로 남긴다. 도구의 값은 operator가 제공한 측정이며 독립적인 production 검증 증거가 아니다. source age는 provider별 기준, 사용량은 Actions/Vercel Dashboard의 실제치를 함께 기록한다.

## 출시 완료 조건

코드 구현·로컬/CI 검증·원격 설치·production 실검증을 따로 표시한다. 인증·WAF·구버전 차단·예약 실제 성공·실기기 성능이 확인되기 전 P7 전체 완료로 표시하지 않는다. 연구 결과·가중치·모델 승격은 이 운영 연결로 자동 발행하지 않는다.

공식 문서: [Vercel monorepo](https://vercel.com/docs/monorepos), [Git deployment 설정](https://vercel.com/docs/project-configuration/git-configuration), [GitHub workflow 이벤트](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [ruleset API](https://docs.github.com/en/rest/repos/rules).
