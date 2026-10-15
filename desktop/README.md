# Orbit desktop

The first native milestone: the approved Three.js scene inside a Tauri 2 macOS app. The Suisei palette, source rings, planet selection, transfers, formation and completion animations come from the existing prototype. `prototype/planetary-animation/` remains an independent animation study; desktop development now lives here.

Live Orbit imports open Redmine tickets assigned to your account and keeps its own To do / Doing / Done states locally. Task changes and motion/quality preferences survive relaunch. The separate demo build uses fresh sample planets and animation testing controls. ClickUp, personal notes, assignment sounds and full completed-system navigation are later milestones.

## Develop

Requires Node/npm, Rust and Xcode or its Command Line Tools. On this Mac, Rust was installed into the repository's ignored `.tools/` directory without changing shell startup files. The npm launcher finds that toolchain automatically; other machines can use their normal Rust installation.

```sh
cd /Users/ammar/Documents/Orbit/desktop
npm ci
npm run dev
```

`npm run dev` opens the native app with Vite hot reload on `127.0.0.1:1420`. Live mode is the default. `npm run dev:demo` opens the isolated native demo; for browser-only animation testing run `VITE_ORBIT_DEMO=true npm run dev:web`. Run only one preview on the port at a time.

Validation uses application builds and manual checks. The demo build retains its animation testing controls; the desktop automated test suite and its commands have been removed.

## Build and launch

```sh
npm run build
open src-tauri/target/release/bundle/macos/Orbit.app
```

Use `npm run build:live` to force a live build or `npm run build:demo` for **Orbit Demo.app**. Demo has the separate identifier `my.ammar.orbit.demo` and cannot invoke live storage, credentials or synchronization commands. Copy `.env.example` to `.env.local` to select `VITE_ORBIT_DEMO=true` or `false`; restart development or rebuild after changing it. The launcher derives the native Cargo feature and frontend flag together, and startup rejects mismatched modes. Normal environment variables cannot switch an already packaged app's mode. Only the non-secret mode flag belongs in this file.

The local Apple Silicon build uses WKWebView and embeds the frontend; no development server is needed. This is a local development bundle, without release signing or notarization. Windows has not been verified.

## Window behavior

- Launch restores position, size, maximization and native fullscreen. Hiddenness is deliberately excluded so each manual launch reveals Orbit.
- The red close button and Command-W hide the window and keep the process alive. Click Orbit in the Dock or use **Orbit → Show Orbit** (Command-1) to return.
- **Orbit → Quit Orbit** / Command-Q exits the app, including while the window is hidden.
- The header fullscreen button controls native macOS fullscreen. The native Window menu also supports fullscreen and minimization.
- Animation continues while another app has focus. Hiding/minimizing or hiding the document finishes current arrival, transfer and completion visuals immediately, then suspends rendering. Showing Orbit hydrates the latest snapshot before rendering; hidden changes never replay as animations.
- Native visibility is checked twice per second because Tauri does not expose desktop hide/minimize events. Only changes are sent to the frontend. Synchronization runs on an independent native worker.
- Window placement is stored by Tauri's window-state plugin in `~/Library/Application Support/my.ammar.orbit/.window-state.json`.

## Redmine and saved data

Open Settings → Redmine, enter the HTTPS server URL and API key, and connect. Credentials are verified before replacing an existing connection. The key is stored only in macOS Keychain and cleared from the form after submission. Source links open in the system browser.

SQLite stores a versioned, typed state document at `~/Library/Application Support/my.ammar.orbit/orbit.sqlite`. Each save is one transaction covering account caches, task identities, workflow states, appearance seeds, preferences and last successful sync. The credential reference is stored there; the secret is not. Invalid/newer databases produce an error and are never silently reset. Cached tasks remain usable offline. Disconnect removes the active credential and stops syncing while retaining the cache.

The native worker polls every 20 seconds after its previous attempt, independent of rendering, and coalesces manual refresh requests. It fetches all pages before reconciling. First import is already formed on the waiting ring. Subsequent new tickets start as To do; metadata updates preserve private workflow state. A ticket missing from a successful complete snapshot becomes Done, and a previously missing ticket that returns becomes To do. Manually completed tickets stay Done while still present upstream. Source status is neither mapped nor edited. Network/partial-response failures keep cached tasks; authorization failures pause polling until credentials are updated, and rate-limit responses defer retries.

Local task destination states are saved before animations begin. Quitting or hiding during a transition therefore restores the destination, with no animation progress stored. Per-account identity includes normalized server URL, authenticated user ID and issue ID; changing a token preserves the account's private state.

## Native verification

Set `ORBIT_DIAGNOSTICS=1` when launching the executable to print native visibility changes and cumulative rendered frames every five seconds:

```sh
ORBIT_DIAGNOSTICS=1 src-tauri/target/release/bundle/macos/Orbit.app/Contents/MacOS/orbit-desktop
```

Use **Motion & quality** for frame limit and resolution. No automatic quality downgrade is applied. Measure the release bundle on the intended monitor/fullscreen size; browser FPS alone does not establish CPU/GPU efficiency. See `verification/native-smoke.md` for the foundation baseline and `verification/persistent-tasks.md` for this milestone's verification and remaining real-account checks.
