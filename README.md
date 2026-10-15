# Orbit

A local desktop task companion with a low-poly planetary dashboard. Unstarted tasks wait outside the source orbits, active Redmine and ClickUp tasks move on their own rings, and completed tasks travel into a separate system.

The Mac app lives in [`desktop/`](desktop/README.md), using Tauri 2 and Three.js. Live mode imports your open assigned Redmine tickets, saves Orbit workflow states and preferences in SQLite, and stores credentials in macOS Keychain. A separate demo build provides sample planets and manual animation controls.

```sh
cd desktop
npm ci
npm run dev
```

See the [desktop guide](desktop/README.md) for the local Rust toolchain, native builds and verification. Product decisions are recorded in [DISCUSSION.md](DISCUSSION.md).

- [`prototype/planetary-animation/`](prototype/planetary-animation/README.md): independent browser animation study.
- [`redmine/`](redmine/): standalone GET-only Redmine client and CLI. The desktop uses a native importer; both keep Redmine read-only. Orbit manages its own workflow state.
- [`design/`](design/): visual references and research.

Next milestones are ClickUp, personal notes, background assignment alerts and full completed-system navigation.
