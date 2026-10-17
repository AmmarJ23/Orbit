# Persistent tasks and Redmine — verification

Verified on 15 October 2026. Application source is in `desktop/`; the independent planetary prototype and standalone Redmine CLI were not changed by this milestone.

The desktop automated test suite and its commands were removed at the user's request after implementation. Manual animation controls remain available in demo builds.

## Build and static checks

- After removing the suite, Vite production builds and offline `cargo check` pass for both live and demo modes. No automated tests were run for that change.
- Both `Orbit.app` and `Orbit Demo.app` release bundles build. Their application identifiers are `my.ammar.orbit` and `my.ammar.orbit.demo`. Binary inspection found live command names in the live bundle and none of `connect_redmine`, `get_snapshot` or `save_preferences` in demo.
- Static UI state-marker coverage passes, and the local demo preview returns HTTP 200 with nonempty HTML. These checks supplement the interaction checks; they do not prove every visual state by themselves.
- `git diff --check` passes.

## Observed manually

- Packaged live app launches with the correct mode, saved fullscreen placement, Redmine setup/empty state and motion/quality controls.
- Labels were disabled, the application quit with Command-Q, and then relaunched. Labels remained disabled. The original enabled setting was restored afterward.
- Normal/fullscreen and approximately 800×600 native window layouts were inspected. Connection controls fit at the minimum window size. Screenshot: `persistent-live-minimum.jpg` (1604×1204 Retina pixels).
- Browser demo renders the expected planets, creates and selects a new active planet, and starts its visible completion journey.
- Packaged demo launches with its own identity and testing controls; the live connection panel is absent.

- 2026-10-17, real Redmine account (red.mypatil.my, user 712), key entered through Settings in a fresh live build: the one open assigned ticket (#26430) was imported as a Not started planet with the correct title, project, priority and source link; the key is in the login Keychain under `my.ammar.orbit.redmine` and only its reference is in `orbit.sqlite`; `lastSynced` kept advancing in the saved state (~20s steps) without user action.

## Remaining manual checks

- Real-account source-link opening, imported-task keyboard interactions and restoration after a quit/relaunch.
- Native demo hide/minimize cycles during formation, transfer and completion should be exercised interactively. Further native UI automation was interrupted by a foreground focus change, so these physical interaction checks are not claimed as passed.
- Longer uninterrupted fullscreen GPU/energy and everyday-work validation remains a follow-up to the foundation measurements in `native-smoke.md`.

## Implementation notes

- SQLite stores a versioned typed state document in one transactional row. It contains all account caches and preferences; there is no per-frame persistence. Credential references are identifiers, not keys.
- The native worker uses blocking HTTP on its own thread. Local actions commit independently while a fetch is running; reconciliation clones the latest saved state after a complete successful fetch. Requests never overlap, and manual refreshes are coalesced.
- First import and connection responses always settle, independent of whether IPC replies or snapshot events arrive first. Native visibility and frontend hydration gate later animations.
- Rustfmt was installed into the existing project-local toolchain and the native source was formatted.
