# Deployment And Release

## Web Frontend

1. Create a Vercel project rooted at `apps/web`.
2. Add production environment variables from `.env.example`.
3. Provision Postgres in Neon and point `DATABASE_URL` at it.
4. Run schema migrations with Drizzle before promoting production deploys.
5. Use Vercel preview deployments for pull requests and production from `main`.

## Worker

1. Deploy `apps/worker` as a small Node process, cron job, or scheduled serverless task.
2. Give it access to the same `DATABASE_URL`.
3. Run periodic aggregate recomputation, backfills, deletion jobs, and upload repair tasks there.

## Garmin Sideloading

1. Install the SDK and Garmin device libraries. The repo can install the raw SDK archive:

```bash
pnpm watch:sdk
```

2. Use Garmin SDK Manager to install device libraries for the supported product set.
3. Build a target-specific sideload PRG:

```bash
DEVICE=venu3 pnpm --filter @film-intensity/watch build
```

4. Export a signed package when the Garmin SDK is configured:

```bash
export DEVELOPER_KEY="/absolute/path/to/garmin-store-key.der"
pnpm --filter @film-intensity/watch export
```

5. Connect the watch over USB.
6. Copy the generated app artifact into the watch's `GARMIN/APPS` directory.
7. Set the app's `Backend URL` setting in Garmin Connect Mobile or Garmin Express to the deployed web origin, for example `https://film-intensity.vercel.app`.
8. Launch the app on-device and pair it to a web session using the 6-digit code from the dashboard.

## Garmin Store Release

1. Validate the app on each supported device family.
2. Confirm battery impact and missing-capability behavior for HRV unsupported devices.
3. Prepare:
   - app description
   - screenshots
   - privacy-policy URL
   - support email
   - non-medical positioning language
4. Submit the signed package to the Connect IQ Store.

## CI/CD

- GitHub Actions workflow: `.github/workflows/ci.yml`
- Root `pnpm build` excludes the Garmin package by default because the SDK is not present on normal CI runners.
- Enable the watch job only after you provision Garmin SDK tooling in CI.
