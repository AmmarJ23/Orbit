# Orbit desktop

The first native milestone: the approved Three.js scene inside a Tauri 2 macOS app. The Suisei palette, source rings, planet selection, transfers, formation and completion animations come from the existing prototype. `prototype/planetary-animation/` remains an independent animation study; desktop development now lives here.

This preview uses sample planets. Planet changes still reset on relaunch. Local task persistence, secure credentials, Redmine/ClickUp connections, notes and background alerts are the next milestones.

## Develop

Requires Node/npm, Rust and Xcode or its Command Line Tools. On this Mac, Rust was installed into the repository's ignored `.tools/` directory without changing shell startup files. The npm launcher finds that toolchain automatically; other machines can use their normal Rust installation.

```sh
cd /Users/ammar/Documents/Orbit/desktop
npm ci
npm run dev
```

`npm run dev` opens the native app with Vite hot reload on `127.0.0.1:1420`. `npm run dev:web` runs the browser preview on that same port. Run only one at a time. `npm test` checks rendering lifecycle behavior.

## Build and launch

```sh
npm run build
open src-tauri/target/release/bundle/macos/Orbit.app
```

The local Apple Silicon build uses WKWebView and embeds the frontend; no development server is needed. This is a local development bundle, without release signing or notarization. Windows has not been verified.

## Window behavior

- Launch restores position, size, maximization and native fullscreen. Hiddenness is deliberately excluded so each manual launch reveals Orbit.
- The red close button and Command-W hide the window and keep the process alive. Click Orbit in the Dock or use **Orbit → Show Orbit** (Command-1) to return.
- **Orbit → Quit Orbit** / Command-Q exits the app, including while the window is hidden.
- The header fullscreen button controls native macOS fullscreen. The native Window menu also supports fullscreen and minimization.
- Animation continues while another app has focus. Native hidden/minimized state and webview visibility each suspend the shared render loop, including the completed-system renderer. Resuming resets the frame clock so hidden time does not advance animations.
- Native visibility is checked twice per second because Tauri does not expose desktop hide/minimize events. Only changes are sent to the frontend. Future sync work must remain independent of the render loop.
- Window placement is stored by Tauri's window-state plugin in `~/Library/Application Support/my.ammar.orbit/.window-state.json`.

## Native verification

Set `ORBIT_DIAGNOSTICS=1` when launching the executable to print native visibility changes and cumulative rendered frames every five seconds:

```sh
ORBIT_DIAGNOSTICS=1 src-tauri/target/release/bundle/macos/Orbit.app/Contents/MacOS/orbit-desktop
```

Use the existing **Motion & quality** controls for frame limit and resolution. No automatic quality downgrade is applied. Measure the release bundle on the intended monitor/fullscreen size; browser FPS alone does not establish CPU/GPU efficiency. See `verification/native-smoke.md` for recorded results and remaining checks.
