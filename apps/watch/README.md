# Garmin Watch App

Connect IQ device app scaffold for recording film biometrics.

## Expected Environment

- Connect IQ SDK 9.x
- `monkeyc` compiler
- `monkeydo` simulator launcher
- Garmin signing key for export builds

## Scripts

- `pnpm --filter @film-intensity/watch sdk:install`
- `pnpm --filter @film-intensity/watch build`
- `pnpm --filter @film-intensity/watch sim`
- `pnpm --filter @film-intensity/watch export`

## Prototype Configuration

- Run `pnpm --filter @film-intensity/watch sdk:install` to download Garmin's official Linux SDK archive into the monorepo under `.tools/connectiq-sdk/<version>`.
- Set `Backend URL` in the app settings through Garmin Connect Mobile or Garmin Express. Use the deployed web origin, for example `https://film-intensity.vercel.app`, with no trailing slash.
- Launch the app and leave the 6-digit watch code visible.
- Enter that watch code in the web app when creating the film session.
- Press `SELECT` on the watch to pair, then `SELECT` again when the film starts.

Build modes:

- `pnpm --filter @film-intensity/watch build` runs a compiler smoke build and writes `build/film-intensity.prg`.
- `DEVICE=venu2 pnpm --filter @film-intensity/watch build` writes a Venu 2 PRG when Garmin device libraries are installed.
- `BACKEND_URL=https://your-app.vercel.app DEVICE=venu2 pnpm --filter @film-intensity/watch build` bakes the deployed web origin into the PRG for sideload testing.
- `pnpm --filter @film-intensity/watch export` uses Garmin's package mode for a store-ready `.iq` package and requires a real `DEVELOPER_KEY`.
- The raw SDK archive is enough for compiler validation. Simulator/device-specific builds still require Garmin's device library setup from the SDK Manager.

Current live support on-device:

- heart rate via `Sensor.enableSensorEvents()`
- beat-to-beat intervals via `Sensor.registerSensorDataListener()`
- stress via `SensorHistory.getStressHistory()` when supported by the device and permission set

## Sideload Flow

1. Install the SDK locally with `pnpm --filter @film-intensity/watch sdk:install`.
2. Install Garmin device libraries with the SDK Manager.
3. Build the target PRG with `BACKEND_URL=https://your-app.vercel.app DEVICE=venu2 pnpm --filter @film-intensity/watch build`.
4. For store-ready exports, provide a real Garmin signing key and run `pnpm --filter @film-intensity/watch export`.
5. Connect the watch over USB.
6. Copy the generated app artifact into the watch's `GARMIN/APPS` folder.
7. Set `Backend URL` in Garmin Connect Mobile or Garmin Express.
8. Open the app from the watch app list and copy the 6-digit watch code into the web app.
9. Press `SELECT` on the watch to pair, then `SELECT` again to start recording.

## Release Flow

1. Validate the build on each supported device model.
2. Capture screenshots and battery-impact notes.
3. Finalize the Connect IQ manifest metadata, privacy-policy URL, and support email.
4. Submit the export package to the Connect IQ Store review flow.
