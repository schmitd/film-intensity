# Film Intensity

Monorepo for a Garmin Connect IQ watch app, web frontend, ingest APIs, and aggregation worker for measuring film intensity from watch biometrics.

## Apps

- `apps/watch`: Garmin Connect IQ device app scaffold
- `apps/web`: Next.js frontend and route handlers
- `apps/worker`: aggregate/recompute worker

## Packages

- `packages/shared`: shared schemas, scoring, and DTOs
- `packages/db`: Drizzle schema and database helpers

## Tooling

- `pnpm` workspaces
- `Turborepo`
- `Next.js`
- `Drizzle`
- `Vitest`

## Getting Started

1. Install Node.js 22 LTS and `pnpm`.
2. Copy `.env.example` to `.env.local` in `apps/web` or export the variables in your shell.
3. Run `pnpm install`.
4. Run `pnpm dev`.
5. Run `pnpm build` for the web/backend side.
6. Run `pnpm watch:sdk` to install Garmin's official Linux SDK archive locally.
7. Run `pnpm watch:build` for a generic `.prg` compiler smoke build. Device-specific sideload builds and signed `.iq` exports require additional Garmin setup; see the watch README.

## Garmin Development

The watch app uses Garmin's Connect IQ SDK and Monkey C toolchain, which are not bundled with this repo.

Expected local environment:

- Connect IQ SDK 9.x, bootstrapped with `pnpm watch:sdk` or installed manually
- VS Code + Garmin Monkey C extension
- Connect IQ simulator
- Garmin signing key for release exports

See [apps/watch/README.md](apps/watch/README.md) for the sideload flow.
