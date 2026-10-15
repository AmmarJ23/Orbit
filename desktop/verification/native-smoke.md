# Native Mac verification — 15 October 2026

Environment: Apple M1, MacBookPro17,1, 16 GiB RAM, macOS 27.0 (26A428), arm64. Rust 1.99.0, Node 26.0.0. Tauri 2.12.4, window-state plugin 2.5.0, Three.js 0.186.1.

## Build and interaction checks

- `npm run build` passed and produced a standalone local `Orbit.app` (5.34 MiB). The app loaded the embedded frontend at `tauri://localhost`, with no Vite server running.
- `npm run dev` passed its debug build, launched the native executable with Vite on `127.0.0.1:1420`, and received a live CSS hot-reload update. Development mode is left running for continued work.
- Native WKWebView screenshots and accessibility state confirmed the approved blue scene, source rings, labels, testing controls and sample planet creation/formation.
- Header fullscreen entered and exited native macOS fullscreen.
- Command-W hid the window. The same native process remained alive, `native=false` / `document=false`, and cumulative render frames stopped at 13,894 until reopening.
- Opening the existing bundle in Finder exercised the macOS reopen handler: the same process/window returned and resumed at 60 fps, with its in-memory display choices preserved.
- Command-H independently suspended rendering; Show Orbit / Command-1 resumed it. The counter remained at 3,935 throughout the hidden interval.
- Minimization emitted the native suspension signal. The window was restored during the attempted 30-second minimized sample, so that sample is excluded from idle results.
- Command-Q terminated the process. A fullscreen quit saved `fullscreen=true` and placement `x=-2270, y=0`. Manual relaunch restored native fullscreen, confirmed by the initial **Exit fullscreen** control without another fullscreen action.
- Four automated tests pass: independent visibility gates; cancellation and clock reset across long hides; no duplicate render loops; frame limits across 60/75/90/120/144 Hz, uncapped callbacks and clock resets.

## Resource baseline

Samples sum the app plus its newly launched WebKit WebContent, GPU and Networking processes. CPU percentage comes from cumulative process CPU-time deltas; 100% means one CPU core. RSS is resident memory, not total allocation or GPU memory. WebKit GPU-process CPU is **not** hardware GPU utilization.

| Scenario | Duration | Combined CPU | Combined RSS | Evidence |
| --- | --- | --- | --- | --- |
| Visible window, default 60 fps / 1.5× resolution | 60.1 s | 30.51% | 75.9–86.8 MiB | [Raw samples](resources-visible-window.json) |
| Command-H hidden, before the pacing correction | 30.0 s | 0.34% | 49.1–57.5 MiB | [Raw samples](resources-hidden-baseline.json) |
| Fullscreen, including switching away to another Space | 180.0 s | 8.30% | 37.4–118.2 MiB | [Mixed samples](resources-fullscreen-mixed.json) |

The mixed fullscreen result includes a long non-rendering interval and must not be interpreted as continuous fullscreen cost. Its first uninterrupted 40 seconds averaged 25.88% combined CPU. During a steady 30-second visible window interval, the frame counter advanced from 6,267 to 8,059: 59.73 fps. Some startup/transition intervals were slower. No quality settings were silently reduced.

The inherited frame limiter discarded fractional callback timing, which under-delivered on refresh rates that did not divide the selected cap (75 Hz / 30 fps produced 25 fps). The corrected application carries the remainder forward. The regression test failed before the fix and passes afterward. The independent browser prototype was left untouched.

## Remaining practical validation

- Longer uninterrupted fullscreen sessions on the intended monitor, including simultaneous formation/completion load.
- Hardware GPU utilization, energy use and the user's assessment of impact on ordinary work. The present CPU/RSS samples do not establish these.
- Monitor disconnect/reconnect and sleep/wake placement behavior; Windows has not been tested.
- Actual sync and sound alerts after close, once those features exist. This milestone establishes the independent native lifecycle only.

Local diagnostic logs are ignored by Git. Reproduce measurements with `ORBIT_DIAGNOSTICS=1` and `scripts/sample-resources.py`; identify the app's newly launched WebKit PIDs each time.
