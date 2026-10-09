# Orbit planetary animation prototype

Throwaway Three.js scene to assess gentle low-poly motion and interaction. No task integrations, storage, or production application UI.

```sh
cd prototype/planetary-animation
npm install
npm run dev
```

Drag to rotate, scroll to zoom, and click a planet to inspect it. The inner comet-blue and outer ice-cyan orbits move gently; grey exoplanets remain at fixed orbital positions. Controls adjust speed, frame cap, resolution and stars, or pause motion and reset the camera. Rendering pauses when the document is hidden, not merely unfocused. Quality settings are manual and kept only in memory.

`npm run build` produces a standalone static build in `dist/`. This renderer is intended for the agreed Tauri shell, but this prototype runs in a browser while the Rust toolchain is unavailable. Browser measurements are not proof of native Tauri performance. The FPS readout is rendered frames per second, not CPU/GPU utilization.

Validate on the actual second screen with normal work running. Compare CPU/GPU and memory in Activity Monitor across several minutes and several quality settings; inspect sustained motion, picking and drag behavior. Do not infer power use from FPS alone.

Palette: Suisei-inspired midnight navy, comet blue and ice blue from `design/PALETTE.md`, including scene lighting, planets, stars, orbit rings and controls.
