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

Select an unstarted grey planet and choose **Enter orbit** to start its sample task. Orbital insertion sweeps around the centre through a 72-degree arc, easing inward and fading to blue over six simulation seconds before joining the source ring tangentially (Redmine: inner ring; ClickUp: outer ring). Selection follows the planet, and the action is disabled during insertion. Pause and speed controls apply to the transfer. Changes are in memory only and reset on reload; no external tasks are modified.

Active planets expose **De-orbit** in the same selected-world panel. They follow a curved six-simulation-second outward transfer to the dashed waiting ring (radius 9.5), fade back to slate blue and settle with zero orbital speed. Status returns to **Not started** on arrival and Enter orbit becomes available again. Both directions preserve position and angular velocity at the handoff and respect pause/speed. Source identity stays unchanged, so re-entering returns to the correct active ring.

The collapsible **Testing menu** combines **Planets** and **Motion & quality** tabs. The Planets tab contains an inline form for a name, source (Redmine / ClickUp), and starting state (Not started / In progress). Waiting planets appear on the dashed ring; active planets appear directly in their source orbit. New planets use the Suisei blue palette, are placed in the widest angular gap on the chosen ring, and are selected automatically. Enter orbit and De-orbit work on added planets too. Names must contain a non-space character and are limited to 60 characters. Clear resets the form. Switching tabs preserves drafts and quality settings. The menu stays open after adding on desktop; narrow previews collapse it to reveal the selected planet. Added planets and state changes are deliberately in memory only; the actual application should save these locally.

New planets form by stylized accretion over **3.5 simulation seconds**, directly on their starting ring. Blue rocky grains gather into a growing low-poly seed. A comet-blue leader draws out to opening brackets, reveals an ice-blue task name, then reverses the reveal, closes its brackets and retracts the leader into the planet. Tags follow camera rotation; long names truncate. Formation obeys pause/speed, blocks orbital transfers until complete, and disposes its temporary geometry, material and tag afterward. Initial sample planets do not replay the arrival.

Arrival refinement: dust fades in over 0.6 simulation seconds. After the 3.5-second formation completes, the tag animates for three additional simulation seconds. Brackets fit measured text with 8px side padding; names wider than 190px (or the viewport limit) truncate with an ellipsis. Selected World keeps the full name. Tags refit on resize.

## Completion study

Select a planet and choose **Complete task**. Its orbit contracts through a half-turn (4.8 seconds). A continuous deformation stretches its original coloured surface into a long, tapered debris ribbon; fine grains sample the original body volume and follow the same deformation. The leading end curls around the centre while the outer material extends away. Once the ribbon has formed, grains continue along its curve into one shared entrance at the centre, without a pause or separate radial shortcuts. The handoff preserves motion while the curve settles, and absorption lasts until the last grain has travelled through the tip (about 20.5 seconds for the full disruption). Temporary surface and dust resources are disposed after absorption. The shared **Completed system** glimpse then shows outward dust travel (3.6 seconds), original planet reassembly (3.5 seconds), and a settled hold/close (2.25 seconds). Total: about 35 seconds at normal speed. The Suisei palette and placeholder centre remain.

**Complete active planets** in Testing menu exercises simultaneous journeys. Redmine keeps the inner ring; ClickUp keeps the outer ring. Completed planets stay in the in-memory completed scene and disappear from active picking. Pause/speed and visibility suspension apply to both scenes. Transfers, formation and repeated completion cannot overlap on the same planet. Temporary dust geometry/materials are disposed, and the preview renderer draws only while its window is visible. No external tasks are updated; refresh resets the study. Full completed-system navigation remains outside this animation prototype.
