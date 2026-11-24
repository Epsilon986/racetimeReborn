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

- Hold **Space**, **W**, **Up**, the accelerator, or the track to accelerate. Briefly release to change the line while keeping momentum.
- Finish **two laps**. Your best input recording becomes your opponent on the next attempt.
- Press **R** or Restart to retry immediately.
- Press **P** or the pause button to pause/resume. Changing tabs or losing focus also pauses and releases input.
- Open the **three-dot menu** to toggle your personal-best ghost, sound, or fullscreen. These controls are available on phone and desktop layouts.
- Sound is opt-in. Best runs are saved in browser local storage; if storage is unavailable, they remain available for the current session.

## What is implemented

One recovered Farm River Sprint layout, three lanes, automatic path following, acceleration/release input, lane drift, wall speed penalties, countdown, two-lap timing, instant retries, pause/resume, and personal-best ghosts. A close camera follows the player with a small look-ahead into corners. The circuit artwork, cars, scenery, and interface are drawn for this prototype.

The game fills the viewport. The race HUD contains the clock, lap count, restart/pause/menu controls, and accelerator. The previous sidebar, pace meter, session run list, tips, branding bars, and footer have been removed.

All three road lanes are constructed from the recovered paths, with solid dividers and an asphalt shoulder on each side. Each wall sits a quarter lane width beyond the outer lane edge. Collision limits use those same wall positions and the car's width.

Handling version 2 raises the maximum speed from 640 to 920 world units/second, accelerates faster, responds more quickly to releases, and reduces wall penalties. Previous version-1 recordings stay in storage but are excluded from racing because their simulation is incompatible. Short retries use a shorter countdown.

Handling version 3 halves the maximum lateral speed and slows the buildup of sideways movement. Brief releases still adjust the racing line, while lane changes take longer. Personal-best ghosts start fresh for version 3.

Handling version 4 gently pulls the car toward its current lane center. A lane change commits once the car is 8% of a lane width past the divider. Personal-best ghosts start fresh for version 4.

Handling version 5 gradually strengthens the pull toward the lane center as cornering drift fades. Personal-best ghosts start fresh for version 5.

Simulation version 6 adds the extra wall clearance and starts a fresh set of personal-best ghosts.

Simulation version 7 widens the shoulders further. A wall hit now cuts speed by 48% under throttle or 35% after lifting. Personal-best ghosts start fresh for version 7.

Simulation version 8 increases the speed loss from wall hits to 70% under throttle or 60% after lifting. Personal-best ghosts start fresh for version 8.

Simulation version 9 softens the inward drift when the accelerator is released, so short lifts make smaller corrections. Personal-best ghosts start fresh for version 9.

The handling is **reconstructed prototype tuning**, not a line-for-line port of the APK. Daily rotation, accounts, online leaderboards, currency, racer collections, and native app packaging are not implemented. There are no simulated online competitors or server rankings.

## Rendering and dependencies

Vite and TypeScript are installed through npm and locked in `package-lock.json`. The renderer requests **Phaser 3.90.0** from jsDelivr at runtime. When available, Phaser presents a CanvasTexture containing the race scene. A complete Canvas 2D renderer is active immediately and remains playable if Phaser cannot load. The interface uses system fonts and makes no font downloads.

This arrangement allowed development under the current network restriction, where Phaser was not cached and package downloads were blocked. Before a mobile or fully offline release, install/bundle Phaser locally and test the Phaser adapter on target devices. Do not describe this prototype as an offline-packaged Phaser application.

## Structure

```text
src/main.ts                 Race lifecycle, controls, HUD, and audio
src/game/track.ts           Recovered path sampling and geometry
src/game/simulation.ts      Fixed 120 Hz simulation and ghost playback
src/game/storage.ts         Versioned local replay validation/persistence
src/game/renderer.ts        Canvas drawing and Phaser presentation adapter
src/game/camera.ts          Smooth player follow, look-ahead, and zoom
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

All 19 automated checks pass. They cover track geometry, matching road/collision boundaries, outer-lane clearance, per-tick ghost equivalence, quick-release response and speed retention, lane centering and changes, acceleration/stopping, wall penalties, input-strategy differences, clock formatting, replay validation, and camera visibility over a complete race at phone, landscape-phone, and desktop viewport sizes. Production compilation and asset bundling pass with `npm run build`.

A deterministic corner-aware input probe completes the two-lap course in 17.65 seconds with no wall contacts, versus 27.90 seconds and 33 contacts when holding full throttle. These times come from the browser simulation.

Browser screenshot testing was attempted on this host with Chrome and Edge, but their GPU/renderer child processes could not initialize under the execution restrictions. The existing local Vite preview returns HTTP 200. Visual appearance, real pointer/keyboard interactions, the external Phaser runtime, and mobile behavior still need interactive verification. No Android/iOS device has been tested.

The owner supplied [this original gameplay video](https://www.youtube.com/watch?v=3t981LXQzjc) for this revision. Automated access could find its indexed description but could not inspect playback; no frame-by-frame match is claimed.

## Next implementation priorities

1. Play-test handling against the original and port the original integer movement rules where recoverable.
2. Bundle Phaser locally and verify rendering/input on desktop and mobile browsers.
3. Add more recovered tracks and track-specific versioned records.
4. Add server-validated replays, daily track selection, and leaderboards.
5. Package the browser application with Capacitor and test on Android/iOS devices.
