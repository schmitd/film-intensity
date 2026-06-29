# Development Environment

## Core Tooling

- Node.js 22 LTS
- `pnpm` 10.x
- `git`
- Docker Desktop or local Postgres for database-backed development

In this WSL environment, load Node through `nvm` before running repo commands:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
mkdir -p /tmp/corepack
export COREPACK_HOME=/tmp/corepack
mkdir -p /tmp/film-intensity
export TMPDIR=/tmp/film-intensity
export TEMP=/tmp/film-intensity
export TMP=/tmp/film-intensity
```

## Garmin Tooling

- Garmin Connect IQ SDK 9.x
- VS Code or VSCodium with the Garmin Monkey C extension
- Connect IQ simulator
- Garmin developer signing key

Recommended shell environment after bootstrapping the SDK in-repo:

```bash
pnpm watch:sdk

export SDK_HOME="$(cat "$PWD/.tools/connectiq-sdk/current-sdk.cfg")"
export MONKEYC_BIN="$SDK_HOME/bin/monkeyc"
export MONKEYDO_BIN="$SDK_HOME/bin/monkeydo"
export DEVELOPER_KEY="$PWD/.tmp/garmin/developer_key.der"
```

## Web And Backend Environment Variables

Copy `.env.example` values into your local environment:

- `DATABASE_URL`
- `TMDB_API_KEY`
- `NEXTAUTH_SECRET`
- `AUTH_URL`
- `RESEND_API_KEY`
- `SENTRY_DSN`
- `FILM_INTENSITY_API_BASE_URL`

## Local Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm watch:sdk
pnpm watch:sdk-manager
pnpm watch:check
pnpm watch:build
```

Notes:

- `pnpm watch:sdk` downloads Garmin's official Linux SDK archive directly from Garmin's published `sdks.json` manifest into `.tools/connectiq-sdk/<version>` and records the active path in `.tools/connectiq-sdk/current-sdk.cfg`.
- `pnpm watch:sdk-manager` opens Garmin's SDK Manager for authenticated simulator and device-library downloads. On Ubuntu 24.04/WSL it uses repo-local compatibility libraries because Garmin's manager still links against WebKitGTK 4.0.
- `pnpm watch:check` is the fastest Monkey C feedback loop. It installs the SDK if needed, prints the active compiler version, and produces `apps/watch/build/film-intensity.prg`.
- `pnpm watch:build` now generates a local development signing key automatically if `.tmp/garmin/developer_key.der` does not exist.
- Simulator and target-specific device libraries are a separate Garmin concern. The compiler smoke build works from the raw SDK archive, but `DEVICE=venu3 pnpm --filter @film-intensity/watch build`, `pnpm --filter @film-intensity/watch sim`, and store export require the fuller simulator/device-library setup from Garmin's SDK Manager.

## Current Prototype Behavior

- The web app currently uses an in-memory store so the route surface works immediately.
- `packages/db` contains the Drizzle schema and config for the Postgres-backed version.
- The watch app is a Connect IQ scaffold with UI, packaging scripts, and clear integration points for sensors, FIT recording, and uploads.
