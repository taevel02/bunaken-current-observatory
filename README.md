# Bunaken Current Observatory

[공개 대시보드](https://bunaken-current-observatory.vercel.app/) · [연구 보고서](https://bunaken-current-observatory.vercel.app/research) · [소스코드](https://github.com/taevel02/bunaken-current-observatory)

부나켄 19개 다이브 사이트의 현장 PCI 기록과 환경 자료를 연결하는 진행 중인 연구다. PCI는 관찰자별 무차원 전체 체감이며 유속·위험도·다이빙 안전 판정이 아니다. 예측력은 계속 검증 중이다. 관측이 늘어도 정확도가 자동으로 보장되지는 않는다.

코드와 개발/운영 문서는 [MIT](LICENSE)다. 연구 원고·관측·공급자 자료에는 [별도 이용 조건](LICENSING.md)이 적용된다. main과 data는 모두 공개이며 관측 revision·연구 초안·Git 이력도 공개다.

## 현재 화면과 운영

- `/`: 한국어 기본, `?lang=en` 영어. 왼쪽 Site 비교표·오른쪽 선택 Site의 PCI/모델 조류/조석. 날짜·Site·모델 선택을 query로 유지한다.
- 공개 페이지는 헤더·날짜/모델 선택·Site 이름·열 제목·그래프 제목/시간축을 먼저 보여준다. 수치·곡선 등 자료 의존 영역만 스켈레톤을 표시하며 자료 도착 시 미전송 선택을 유지한다. 달 정보는 별도로 로드하며 같은 날짜의 Site·모델 선택은 추가 서버 요청 없이 반영한다. 날짜 변경은 새 자료를 읽는다.
- `/research`: `audience=guide` 일반용, `audience=technical` 전문가용. 이전 공개 URL은 canonical 페이지로 연결한다.
- `/admin/login`: 서버 자체 인증. 로그인 설정은 Production 서버 변수이며 preview/development는 관리자 기능을 차단한다.
- main: 코드·schema·신뢰된 workflow. data: 관측·snapshot·공식 seal·공개 패키지·연구 파일. 서버 DB·OAuth·LLM runtime 의존성은 없다.
- WITA 07:17/19:17 수집, 20:17 seal. 관측 push도 trusted chain을 실행한다. 고정 pin은 `ops/workflows/data-entrypoint.yml`에서 확인한다.

공개 experimental package와 공식 D+1 forecast는 별개다. 공식 forecast는 전날 WITA 20:00 이전 실제 저장된 성공 snapshot으로 확정한다. 늦은 수집·backfill로 과거 예측을 덮어쓰지 않는다. 비교는 `validation/d1/`에 불변 저장한다. 원 atlas·원 NetCDF·자격증명은 공개 저장하지 않는다.

## 요구 도구와 설치

Node.js 24, pnpm 12.6.0, Python 3.14.7, uv를 사용한다. 웹은 React 19.3.0·TypeScript 7.0.2·Tailwind CSS 4다. Next.js/ESLint compiler API용 TypeScript 6 alias는 별도 호환 의존성이다.

```sh
npm install --global pnpm@12.6.0
pnpm install --frozen-lockfile
uv sync --project engine --locked
uv sync --project engine --extra providers --locked
```

실제 버전은 package manifest·pnpm-lock.yaml·engine/uv.lock에 고정한다. 기본 테스트는 합성 fixture와 provider mock을 사용하며 실제 credential은 필요하지 않다.

## 실행과 검증

```sh
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
uv run --project engine --locked python -m unittest discover -s engine/tests
uv run --project engine --extra providers --locked python -m unittest discover -s engine/provider-tests
uv run --project engine --locked python -m bunaken_engine status
```

`pnpm test`는 계약·웹·인증 HTTP·엔진을 포함한다. provider 테스트는 별도 명령이다. 선택 브라우저 테스트는 Playwright가 지정되지 않으면 skip하며 성공 증거로 세지 않는다.

```sh
BUNAKEN_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
BUNAKEN_BROWSER_EXECUTABLE=/absolute/path/to/browser \
node --conditions=react-server --test apps/web/test/observation-browser.integration.mjs
```

공개 로딩·Site 선택 검증은 실행 중인 웹 URL과 브라우저를 지정한다. 실제 공개 자료를 읽으며 관측을 저장하지 않는다.

```sh
BUNAKEN_LOADING_URL=http://localhost:3000 \
BUNAKEN_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
BUNAKEN_BROWSER_EXECUTABLE=/absolute/path/to/browser \
node --test apps/web/test/loading-browser.integration.mjs
```

대시보드·원고·transfer의 선택 브라우저 검증은 [대시보드 안내](docs/public-dashboard.ko.md)와 해당 `apps/web/test/*browser*`를 따른다. 실제 자료 reader는 다음처럼 생성한 release를 검증한다.

```sh
BUNAKEN_PUBLIC_RELEASE_DIR=.local/generated-release \
node --conditions=react-server --test apps/web/test/public-release.integration.mjs
```

## 로컬 관리자 설정

`apps/web/.env.example`을 `apps/web/.env.local`로 복사한다. 엔진 공급 설정은 루트 `.env.example`을 `.env`로 복사한다. credential 파일은 Git에 저장하지 않는다. `pnpm admin:hash`는 대화형 터미널에서 비밀번호를 숨겨 입력받는다. 최소 12자, 최대 1024 UTF-8 bytes다.

Next.js의 로컬 dotenv는 `$`를 확장하므로 hash의 `$`를 `\$`로 저장한다. Vercel 변수에는 원래 `$argon2id$…` 값을 직접 넣으며 backslash·따옴표를 포함하지 않는다. ADMIN_ENABLED, ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_AUTH_VERSION, SESSION_SECRET을 설정한 뒤 로그인한다. 공개 observer는 로그인 ID와 다르다.

Production의 GITHUB_WRITE_TOKEN·IDEMPOTENCY_SECRET·CANONICAL_ORIGIN은 [P7 운영 안내](docs/p7-launch.ko.md)의 표를 따른다. 환경변수 수정은 새 Production 배포 후 반영되며 옛 배포를 별도로 관리한다.

## 모델과 실제 환경

Weighted Analog는 목표의 환경 feature와 과거 dive 구간을 비교한 뒤 적격 Overall PCI를 가중 평균한다. 과거 PCI는 정답 label이며 환경 거리 feature가 아니다. 달·염분 등 수집·표시 자료를 모두 현재 모델 feature로 간주하지 않는다. 실제 feature·scaler·mask·gate는 versioned config가 결정한다.

19 Site의 대표 입수점, 수심 18m, 격자 거리 6km를 사용한다. 지도 진행/외해축은 reference_geometry이며 실측 벽 방향이 아니다. Zone 위치는 미확정이다. 숫자 gate를 통과해도 근사 geometry의 support는 experimental/very_low다. 관측 없는 Site의 별도 site-transfer-v1은 항상 unvalidated로 표시한다.

- [Analog·날짜 누수·baseline 검증](docs/analog-engine.ko.md)
- [Site 전이 실험](docs/site-transfer.ko.md)
- [실제 환경 연구·backfill](docs/provider-research.ko.md)
- [FES 파생 자료](docs/fes-atlas.ko.md), [Copernicus 이용 조건](docs/copernicus-license.ko.md)

수집·enrich·release CLI는 `--help`로 현재 계약을 확인한다. `enrich`는 로컬 분석 자료이며 공개 발행하지 않는다. 실제 외부 저장에는 명시적 `--publish`와 깨끗한 trusted checkout·정확한 code SHA가 필요하다. 자동 튜닝·모델 승격·연구 결론 자동 발행은 구현된 기능으로 주장하지 않는다.

## 연구 원고

최신 발행 v1.0.2는 [data branch 원문](https://github.com/taevel02/bunaken-current-observatory/tree/data/research/bunaken-pci-methodology-initial-observations/releases/1.0.2)에서 보존한다. 네 원고는 같은 결과·model version·dataset hash·data cutoff를 사용하며 한국어가 정본이다. 자체 발행 연구 보고서이며 동료심사를 받지 않았다.

[v1.0.2 원고 보존본](docs/research/draft-1.0.2/README.ko.md)는 가중치·공식 D+1 대조·계속되는 관측의 해석을 보강한다. 기존 결과를 새 운영 성능으로 바꾸지 않았으며 2026-10-10 새 release로 발행했다. 작성·bundle 생성·검토·발행은 [연구 운영 안내](docs/research/astra-authoring.ko.md)를 따른다.

## 배포·기여

[운영 문서 목차](docs/README.ko.md) · [P7 현황](PLAN.md) · [기여](CONTRIBUTING.md) · [보안](SECURITY.md)

main의 PR/CI 보호와 data의 non-force 쓰기를 유지한다. 환경 수집은 data의 실행 코드를 사용하지 않는다. Vercel은 main만 배포하고 data 배포를 차단한다. 실제 WAF·옛 세션 철회·모바일 성능은 PLAN의 실증 상태와 구분한다.

예약 수집은 snapshot 저장 → 검증된 웹 release 발행 → Vercel `/api/public/status`의 동일 release 확인 → 공식 D+1 관측 비교 순서로 진행한다. 웹 반영이 24회 확인 안에 완료되지 않으면 CI가 실패한다. 데이터 변경에는 Vercel 재배포가 필요하지 않다. 열린 공개 대시보드는 60초마다 새 release를 확인하며 숨겨진 탭이 다시 열릴 때도 갱신한다. GitHub·Vercel 캐시 때문에 발행과 화면 반영 사이 지연은 남는다.

수집 단계 제한은 300분, 전체 job은 360분이다. timeout 발생 시 단계 로그와 data 저장 여부를 먼저 확인한다. 이미 저장된 run은 `resume_run_id`와 원래 `date_wita`로 재개하며 공식 D+1 cutoff를 소급 변경하지 않는다.

엔진은 반복되는 snapshot·model-context 및 bundle 검증의 성공 hash를 프로세스 내 최대 128개 재사용한다. 임시 replay 경로가 달라도 schema 내용이 같으면 재사용하며 문서·schema·설정이 달라지면 다시 검증한다. 검증만 필요한 읽기에서는 큰 bundle을 재직렬화하지 않는다. 검증된 bundle 출력 캐시는 최대 128MiB다. Git 저장 확인과 모델 재현 검증은 생략하지 않는다.

CI는 `GIT_DATA_CACHE_ROOT`의 공개 Git blob만 Actions cache에 보관한다. 매 실행 Git commit/tree를 다시 확인하고 blob SHA를 검사한다. 손상된 캐시는 원본에서 다시 가져오며 cache 장애는 원본 읽기로 처리한다. 자격증명·FES atlas·원 NetCDF는 이 캐시에 넣지 않는다. 영구 저장소는 data branch이며 이전 forecast·snapshot·관측 revision을 삭제하거나 덮어쓰지 않는다.

수집 단계별 소요 시간은 stderr에 기록한다. 오늘 재수집 시 model cutoff보다 앞선 슬롯은 기존 `scaler_cutoff_after_target` gate로 PCI null을 보존하며, 이후 슬롯과 환경 자료 수집은 계속한다. timeout 확장만으로 수집 성공을 보장하지 않으며 실제 실행 완료와 웹 release 반영을 확인해야 한다.

```sh
git fetch origin main data
python3 ops/backup_restore.py --output .local/backups/new-backup.bundle
python3 ops/performance_report.py --input .local/production-measurements.json
```

백업은 tracked code/data만 포함한다. 실측 없는 p95·LCP·source age·사용량은 미측정으로 남긴다.
