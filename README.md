# Orbit

A local desktop task companion with a low-poly planetary dashboard. Unstarted tasks wait outside the source orbits, active Redmine and ClickUp tasks move on their own rings, and completed tasks travel into a separate system.

The Mac app is being developed in [`desktop/`](desktop/README.md), using Tauri 2 and Three.js. The first preview hosts the approved scene with native window lifecycle and manual rendering controls. It currently uses sample data.

```sh
cd desktop
npm ci
npm run dev
```

See the [desktop guide](desktop/README.md) for the local Rust toolchain, native builds and verification. Product decisions are recorded in [DISCUSSION.md](DISCUSSION.md).

- [`prototype/planetary-animation/`](prototype/planetary-animation/README.md): independent browser animation study.
- [`redmine/`](redmine/): tested GET-only Redmine client, awaiting desktop integration. Orbit keeps its own workflow state; it does not edit Redmine status.
- [`design/`](design/): visual references and research.

Next milestones are local task persistence and secure credential storage, followed by real task imports, notes and background assignment alerts.
