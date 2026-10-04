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

Representative entry coordinates and the 18 m reference depth are confirmed for all 19 sites; bearings, zones and the grid-distance policy remain unverified. Missing sources produce diagnostic failure manifests and null PCI, not synthetic operational data. Remote data writes require explicit `--publish`; CLI collection requires a clean trusted checkout and its exact commit SHA.


## Public dashboard (P4)

The dashboard defaults to tomorrow in WITA and supports today through D+7. Korean and English views include site comparison, tides, observations, PCI reference, methodology and source status. Numeric PCI remains null until the model gates are satisfied.

[Public release runbook](docs/public-dashboard.ko.md) covers schema/hash validation, compressed artifacts, atomic publication and cache behavior. [Private provider research](docs/provider-research.ko.md) covers bounded historical collection and deferred field validation. Public reads use the server-side `GITHUB_OWNER` and `GITHUB_REPO`; they do not use the write token.

## Weighted Analog engine (P5)

[Model execution and validation](docs/analog-engine.ko.md) covers revision eligibility, fixed feature masks, numeric gates, vertical evidence, forward and diagnostic validation, and immutable replay. [Copernicus licence evidence](docs/copernicus-license.ko.md) records the derived-data export policy. `collect --model-from-data --observer ... --rubric ...` reads public revision history and confirmed environmental bundles at one data head. Workflow model training uses the `MODEL_OBSERVER_ID` and `MODEL_RUBRIC_VERSION` repository variables. Numeric PCI remains null when actual field or source evidence is insufficient.
