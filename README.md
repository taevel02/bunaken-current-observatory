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

The public root redirects to `/ko`; `/en` serves English. The initial status API reports unavailable because no source snapshot is configured. `.env.example` contains server-only placeholders; no credentials are required for local contract validation.

## Project layout

- `apps/web`: Next.js App Router and TypeScript interface
- `packages/contracts`: JSON Schema contracts and synthetic shared fixtures
- `engine`: Python contract validation and engine implementation area
- `docs/setup.ko.md`: public `main`/`data` repository setup
