# Bunaken Current Observatory

Public, Korean-first observation project. Both `main` and `data` branches are public; data branch observations, drafts, and Git history are public too. Read [AGENTS.md](AGENTS.md), [PRD.md](PRD.md), [SPEC.md](SPEC.md), and [PLAN.md](PLAN.md) before changing product contracts.

## Requirements

- Node.js 24 LTS (`.nvmrc`), pnpm 12.6.0
- Python 3.14.7 (`.python-version`) and `uv`

## Install

```sh
npm install --global pnpm@12.6.0
pnpm install
uv sync --project engine
```

`pnpm install` creates `pnpm-lock.yaml`; commit it with dependency changes. `uv.lock` pins Python dependencies and runtime selection.
The web workspace typechecks with TypeScript 7.0.2. A TypeScript 6.0 compatibility alias remains available for Next.js and ESLint tooling that still imports the TypeScript compiler API.

For local administrator setup, copy `.env.example` to `.env.local`; `.env.local` is ignored by Git. Keep `ADMIN_ENABLED=false` until all required values are configured. Generate a password hash locally with `pnpm admin:hash`; use at least 12 characters and no more than 1024 UTF-8 bytes. Copy its single-line output directly into `ADMIN_PASSWORD_HASH`, and never place the password or hash in shell arguments, source files, or logs. Use a unique random password from a password manager. Generate `SESSION_SECRET` with the command documented in `.env.example`. Set `PUBLIC_OBSERVER_ID` to a stable public alias, separate from the login username.

## Commands

```sh
pnpm dev        # Next.js development server
pnpm lint       # ESLint
pnpm typecheck  # TypeScript
pnpm test       # shared-schema contract tests in Node and Python
pnpm build      # Next.js production build
```

The public dashboard uses `/` (Korean by default, `?lang=en` for English). Reports use `/research?audience=guide` or `/research?audience=technical`. Older public URLs redirect to these pages. The status API reports unavailable when no validated public release is configured. `.env.example` contains server-only placeholders; no credentials are required for local contract validation.

## Project layout

- `apps/web`: Next.js App Router and TypeScript interface
- `packages/contracts`: JSON Schema contracts and synthetic shared fixtures
- `engine`: Python contract validation and engine implementation area
- `docs/setup.ko.md`: public `main`/`data` repository setup

## Environmental engine (P3)

See [private FES installation and historical research](docs/fes-atlas.ko.md) and [environment sources and runbook](docs/environment-sources.ko.md) for source metadata, geometry verification, immutable snapshot/receipt/seal rules, and live integration dependencies.

```sh
uv sync --project engine --extra providers --locked
uv run --project engine --locked python -m bunaken_engine status
uv run --project engine --locked python -m unittest discover -s engine/tests
uv run --project engine --extra providers --locked python -m unittest discover -s engine/provider-tests
```

Representative entry coordinates, the 18 m reference depth and the 6 km grid limit are configured for all 19 sites. Map progression and offshore axes remain approximate reference geometry; Zones are deferred. Missing sources produce diagnostic failure manifests and null PCI, not synthetic operational data. Copernicus reads reuse a regional dataset within each run, with a 120-second worker deadline and one bounded retry. Remote data writes require explicit `--publish`; CLI collection requires a clean trusted checkout and its exact commit SHA. `enrich` prepares immutable local analysis and never publishes.


## Public dashboard (P4)

The dashboard defaults to tomorrow in WITA and supports today through D+7. Korean and English views include site comparison, tides, observations, PCI reference, methodology and source status. Numeric PCI remains null until the model gates are satisfied.

[Public release runbook](docs/public-dashboard.ko.md) covers schema/hash validation, compressed artifacts, atomic publication and cache behavior. [Private provider research](docs/provider-research.ko.md) covers bounded historical collection and deferred field validation. Public reads use the server-side `GITHUB_OWNER` and `GITHUB_REPO`; they do not use the write token.

## Weighted Analog engine (P5)

[Model execution and validation](docs/analog-engine.ko.md) covers revision eligibility, fixed feature masks, numeric gates, vertical evidence, forward and diagnostic validation, and immutable replay. [Copernicus licence evidence](docs/copernicus-license.ko.md) records the derived-data export policy. `collect --model-from-data --observer ... --rubric ...` reads public revision history and confirmed environmental bundles at one data head. Workflow model training uses the `MODEL_OBSERVER_ID` and `MODEL_RUBRIC_VERSION` repository variables. Numeric PCI remains null when actual field or source evidence is insufficient.

### Actual observation enrichment

```sh
uv run --env-file .env --env-file apps/web/.env.local --project engine --extra providers --locked \
  python -m bunaken_engine enrich --from-data \
  --observer bunaken-observer-01 --rubric pci-overall-v1 \
  --code-commit <exact-clean-head-sha> --output .local/enrichment-new
```

Use `--snapshot <immutable-manifest-path>` repeatedly to reuse collected environments, or `--observations <revision-history.json>` for local inputs. Missing dive windows are collected as backfills at the observation depth. Outputs include environment links, scaler, model context, exclusion reasons and the frozen data head. A later backfill is analysis data, not a forecast available on the original dive date.

### 관측 폼 브라우저 회귀 검증

Playwright는 선택 검증 도구이며 서비스 런타임 의존성이 아니다. 별도 임시 디렉터리에 설치한 Playwright 모듈과 브라우저를 지정한다. 테스트는 합성 관리자·독립 Next.js 복사본을 사용하며 GitHub 자격증명을 비우고 모든 관측 저장 요청을 가로챈다. 실제 관측을 저장하지 않는다.

```bash
BUNAKEN_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
BUNAKEN_BROWSER_EXECUTABLE=/absolute/path/to/browser \
node --conditions=react-server --test apps/web/test/observation-browser.integration.mjs
```

1920×1080·360px, 필수 대표 관측 수심·18m 기본값, WITA 오늘 날짜, 50분 출수 제안·수동 변경, 시간 역전·다음 날 출수, 목록 로딩·기록 재선택, 빈 Peak 숨김, 저장 실패 시 입력 유지, 기존 초안 복원과 메타데이터 보존을 검사한다. 브라우저 모듈 미지정 시 이 선택 테스트는 명시적으로 skip한다. 스크린샷 위치는 `BUNAKEN_UI_ARTIFACT_DIR`로 지정하거나 시스템 임시 디렉터리를 사용한다.

### 공개 패키지 reader 통합 검증

생성한 로컬 release를 실제 서버 reader로 읽고 hash·schema·공개 변수 allowlist·크기 제한·stale·미래 생성 시각 거부를 확인한다. HTTP는 전부 메모리 응답으로 대체하며 실제 외부 요청이나 발행은 하지 않는다. Node 24의 module hook은 테스트에서만 alias를 연결한다.

```sh
BUNAKEN_PUBLIC_RELEASE_DIR=.local/generated-release \
node --conditions=react-server --test apps/web/test/public-release.integration.mjs
```

입력은 `web/latest.json`과 연결된 manifest/gzip이 있는 release output 디렉터리다. 환경변수 미지정 시 선택 테스트는 skip한다. 자료 없는 빈 패키지는 통합 성공으로 처리하지 않는다.

## 연구 보고서 편집

`/ko/admin/research` 또는 `/en/admin/research`에서 네 Markdown 원고와 단일 `results.json`을 연결한다. 서버 초안도 공개 Git 저장이며, 홈페이지는 발행된 버전만 기본 표시한다. 원고·결과·제목 변경은 검토 확인을 초기화한다. 발행은 저장된 `ready` 내용과 정확히 일치할 때만 가능하다. 이전 발행 버전은 불변이며 개정판에는 새 version과 변경 이유가 필요하다.

- 작성 근거: [고정 근거 묶음](docs/research/evidence-2026-10-05/README.ko.md)
- Astra 지시문과 가져오기: [원고 작성 안내](docs/research/astra-authoring.ko.md)
- 로컬 묶음 명령: `node apps/web/scripts/create-research-bundle.mjs --help`
- 브라우저 검증: `BUNAKEN_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node --conditions=react-server --test apps/web/test/research-browser.integration.mjs`

첫 보고서 v1.0.1은 data branch에 발행했다. [최신 공개 release 원문](https://github.com/taevel02/bunaken-current-observatory/tree/data/research/bunaken-pci-methodology-initial-observations/releases/1.0.1). v1.0.0은 보존되며 superseded 상태다. 웹 경로는 `/{locale}/research/bunaken-pci-methodology-initial-observations/{technical|guide}`이며 production Vercel 배포 확인은 P7에 남았다. 공개 목록은 20개 단위 metadata 조회이며 상세 페이지는 선택한 버전의 원고만 검증한다.


## Site 간 PCI 실험

대시보드의 `PCI 모델 → Site 간 추정 · 실험`으로 별도 모델을 선택한다. 무관측 Site에도 다른 Site의 실제 Overall label과 그 Site의 환경으로 추정할 수 있지만, 최소 donor Site·날짜·유효 표본수 gate를 통과해야 한다. 항상 experimental/very_low·unvalidated다. 기본 모델 값과 자동 합치거나 학습 label로 저장하지 않는다.

`PCI`, `모델 조류 속력`, `조석 높이` 그래프를 전환할 수 있다. 실제 점 사이만 부드럽게 연결하며 결측·중복 구간은 끊는다. Site 선택·날짜·모델·그래프는 언어 전환에도 유지된다. Site 표와 선택 목록은 공개 기록 수 내림차순이다.

- [실험 방법·gate·현재 진단](docs/site-transfer.ko.md)
- 검증 CLI: `uv run --project engine --locked python -m bunaken_engine validate-transfer --help`
- 웹 exporter: `--experimental-transfer --code-commit <clean code SHA>`를 추가하면 schema 1.2 sidecar를 생성한다. 현재 CI chain에 연결했으며 실제 원격 반영은 P7 검수 대상이다.
- 브라우저 검증: `BUNAKEN_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs BUNAKEN_BROWSER_EXECUTABLE=/absolute/path/to/chrome node --conditions=react-server --test apps/web/test/transfer-browser.integration.mjs`

현재 24개 관측의 Site 제외·공간 블록 진단은 matched baseline보다 나쁘며 공식 조건 전진은 0/24 제공이다. 추정 기능 구현을 예측력 입증으로 해석하지 않는다. 기존 연구 보고서를 자동 개정·발행하지 않는다.

### 2분할 공개 화면 검증

실제 공개 package에서 생성한 oracle를 사용한다. 새로운 파일 경로를 지정하며 관측·모델·data branch를 수정하지 않는다. 공급 자료가 stale/결측이면 oracle 생성은 실패한다.

```bash
node --env-file=apps/web/.env.local --conditions=react-server \
  apps/web/scripts/prepare-workspace-oracle.mjs /tmp/bunaken-workspace-oracle.json
BUNAKEN_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
BUNAKEN_BROWSER_EXECUTABLE=/absolute/path/to/browser \
BUNAKEN_DASHBOARD_URL=http://localhost:3000 \
BUNAKEN_WORKSPACE_ORACLE=/tmp/bunaken-workspace-oracle.json \
node --conditions=react-server --test apps/web/test/dashboard-workspace.browser.integration.mjs
```

오늘/내일/모레, ko/en, 1920/375/360px에서 Site 선택·PCI/모델 조류/조석·환경 표·원고 전환·SVG 폭 적용을 확인한다. Playwright와 oracle 설정이 없으면 skip하며 검증 통과로 보고하지 않는다. 실제 production build 서버를 대상으로 실행한다. 원고 결과와 데이터 hash는 UI 변경으로 재작성하지 않는다.
