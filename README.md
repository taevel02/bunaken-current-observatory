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

The public root redirects to `/ko`; `/en` serves English. The status API reports unavailable when no validated public release is configured. `.env.example` contains server-only placeholders; no credentials are required for local contract validation.

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
