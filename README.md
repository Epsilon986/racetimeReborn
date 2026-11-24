# Race Time — Reborn

A browser-first racing prototype using TypeScript, Vite, a Phaser presentation adapter, and a rendering-independent simulation.

## Run

Requires Node.js 24 or newer (the test runner uses Node's TypeScript stripping).

```powershell
cd C:\Users\gui35\Projects\race-time
npm install
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173/`.

```powershell
npm test
npm run build
npm run preview
```

`dist/` is a static production build. Vite's development server is bound to the local machine by default. To test from a phone on your own network, run `npm run dev -- --host 0.0.0.0` and open your computer's LAN address on port 5173; Windows Firewall may need to allow it.

## Play

- Hold **Space**, the accelerator, or the track to accelerate. Release to slow down and tighten the line.
- Finish **two laps**. Your best input recording becomes your opponent on the next attempt.
- Press **R** or Restart to retry immediately.
- Press **P** or the pause button to pause/resume. Changing tabs or losing focus also pauses and releases input.
- Toggle your personal-best ghost in the sidebar. On narrow screens, the ghost is shown automatically when a best run exists.
- Sound is opt-in. Best runs are saved in browser local storage; if storage is unavailable, they remain available for the current session.

## What is implemented

One recovered Farm River Sprint layout, three lanes, automatic path following, acceleration/release input, lane drift, wall speed penalties, countdown, two-lap timing, instant retries, pause/resume, personal-best ghosts, and a session run list. The circuit artwork, cars, scenery, and interface are drawn for this prototype.

The handling is **reconstructed prototype tuning**, not a line-for-line port of the APK. Daily rotation, accounts, online leaderboards, currency, racer collections, and native app packaging are not implemented. There are no simulated online competitors or server rankings.

## Rendering and dependencies

Vite and TypeScript are installed through npm and locked in `package-lock.json`. The renderer requests **Phaser 3.90.0** from jsDelivr at runtime. When available, Phaser presents a CanvasTexture containing the race scene. A complete Canvas 2D renderer is active immediately and remains playable if Phaser cannot load. Google Fonts are optional; system fonts are provided as fallbacks.

This arrangement allowed development under the current network restriction, where Phaser was not cached and package downloads were blocked. Before a mobile or fully offline release, install/bundle Phaser locally, self-host any chosen fonts, and test the Phaser adapter on target devices. Do not describe this prototype as an offline-packaged Phaser application.

## Structure

```text
src/main.ts                 Race lifecycle, controls, HUD, and audio
src/game/track.ts           Recovered path sampling and geometry
src/game/simulation.ts      Fixed 120 Hz simulation and ghost playback
src/game/storage.ts         Versioned local replay validation/persistence
src/game/renderer.ts        Canvas drawing and Phaser presentation adapter
src/data/farm-river.json    Converted APK lane geometry
src/style.css               Responsive game interface
tests/                      Simulation and persistence checks
scripts/                    Reproducible data conversion
```

Rendering never advances the simulation. The application accumulates frame time and executes fixed simulation steps. Replays record acceleration changes by simulation tick. The replay version and track ID isolate recordings from future incompatible handling or track changes. Tests compare the full player and ghost state at every tick.

## Source provenance

`src/data/farm-river.json` derives from `assets/monkey/data/short_track_01_lane.json` in the owner-supplied `race-time-1-0-6.apk`. Coordinates are divided by 100, preserving all three 225-point lane paths. No original artwork, audio, credentials, or executable code is included in the browser build.

APK SHA256: `f4b92424b7dca503b8a112c321ec910875fed2c4d8af24a593aa8cdc8f5bf946`.

To regenerate the lane data from the repository's extracted analysis files:

```powershell
python scripts/convert_track.py
```

See `../analysis/APK_FINDINGS.md` for the static-analysis evidence and remaining uncertainties.

## Verification

Automated checks cover track geometry, per-tick ghost equivalence, acceleration/release behavior, wall penalties, input-strategy differences, clock formatting, and malformed replay rejection. Production compilation and asset bundling are checked with `npm run build`.

Browser screenshot testing was attempted on this host, but Chrome's child processes could not initialize successfully under the execution restrictions. Visual appearance, real pointer/keyboard interactions, the external Phaser runtime, and mobile behavior still need interactive verification. No Android/iOS device has been tested.

## Next implementation priorities

1. Play-test handling against the original and port the original integer movement rules where recoverable.
2. Bundle Phaser locally and verify rendering/input on desktop and mobile browsers.
3. Add more recovered tracks and track-specific versioned records.
4. Add server-validated replays, daily track selection, and leaderboards.
5. Package the browser application with Capacitor and test on Android/iOS devices.
