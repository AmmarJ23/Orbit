import * as THREE from 'three';

// Camera choreography between the active and completed systems, chosen in Motion & quality.
// Each style is a pure function of progress u in [0, 1]: it poses the camera and sets the veil,
// star streaks and core glow.
export const travelStyles = [
  ['glide', 'Glide', 'Turns toward the other system and drifts across to it.'],
  ['warp', 'Warp', 'Aims at the other system and jumps there with streaking stars.'],
  ['core', 'Through the core', 'Dives into this system’s core and comes out of the other’s.'],
  ['map', 'Star map', 'Pulls out to show both systems side by side, then dives into the other.'],
  ['dip', 'Dip', 'A quick fade. Always used when reduced motion is on.'],
];
const durations = { glide: 2.8, warp: 2.3, core: 3.4, map: 3.8, dip: 1.3 };
// The moment the destination takes over (heading, picking); hidden by the veil where there is a cut.
const cuts = { glide: 0.5, warp: 0.5, core: 0.47, map: 0.56, dip: 0.42 };
const { clamp, smoothstep: smooth, lerp } = THREE.MathUtils;
const smoother = x => { x = clamp(x, 0, 1); return x * x * x * (x * (6 * x - 15) + 10); };
const easeOut = x => 1 - (1 - clamp(x, 0, 1)) ** 3;
const up = new THREE.Vector3(0, 1, 0);
// Falling into the black hole goes dark; the completed system's pale core comes out bright.
const coreColours = { active: new THREE.Color(0x02050c), completed: new THREE.Color(0xd8eeff) };
const background = new THREE.Color(0x0c1222);

export function createSystemTravel({ camera, veil, markers }) {
  const baseFov = camera.fov;
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const veilColour = new THREE.Color();
  const out = { sky: new THREE.Vector3(), direction: new THREE.Vector3(), streak: 0, energy: { active: 0, completed: 0 } };
  let fov = baseFov;
  let veilOpacity = 0;
  let veilGlow = false; // A centred glow instead of a full-screen wash.
  let markerOpacity = 0;
  let trip = null;

  const styles = {
    // Turn toward the other system, then truck across, rising and widening mid-flight.
    glide(u, t) {
      const turn = smoother(u / 0.85);
      const move = smoother((u - 0.12) / 0.88);
      const lift = Math.sin(Math.PI * move);
      look.lerpVectors(t.from, t.to, turn);
      pos.lerpVectors(t.from, t.to, move).addScaledVector(t.offset, 1 + 0.5 * lift).addScaledVector(up, 8 * lift);
      out.sky.lerpVectors(t.from, t.to, 0.9 * move); // A little star drift sells the distance.
    },
    // Pull back and turn to the destination, a small light on the horizon, then jump at it with
    // streaking stars and drop out in a glow.
    warp(u, t) {
      const k = 9;
      const s = clamp((u - 0.22) / 0.56, 0, 1);
      const th = Math.tanh(k * (s - 0.5));
      const jump = (th / Math.tanh(k / 2) + 1) / 2;
      const speed = s > 0 && s < 1 ? 1 - th * th : 0;
      const windup = smooth(u, 0, 0.24);
      v.copy(t.from).addScaledVector(t.offset, 1 + 0.15 * windup);
      w.copy(t.to).add(t.offset);
      pos.lerpVectors(v, w, jump);
      look.lerpVectors(t.from, t.to, windup);
      fov = baseFov - 5 * windup * (1 - jump) + 40 * speed;
      out.streak = speed;
      out.direction.subVectors(w, v).normalize();
      out.sky.lerpVectors(t.from, t.to, jump);
      veilColour.copy(coreColours.completed);
      veilGlow = true;
      veilOpacity = 0.6 * Math.exp(-(((u - 0.74) / 0.06) ** 2));
    },
    // Spiral down into this system's core, cut at the horizon, and pull back out of the other's.
    core(u, t) {
      const swirl = 1.1;
      const cut = cuts.core;
      if (u < cut) {
        const dive = (u / cut) ** 2.2;
        v.copy(t.dir).applyAxisAngle(up, swirl * dive);
        pos.copy(t.from).addScaledVector(v, lerp(t.distance, 1.9, dive));
        look.copy(t.from);
        fov = baseFov + 22 * dive;
        out.energy[t.fromView] = dive;
        out.sky.copy(t.from);
      } else {
        const rise = easeOut((u - cut) / (1 - cut));
        v.copy(t.dir).applyAxisAngle(up, -swirl * (1 - rise));
        pos.copy(t.to).addScaledVector(v, lerp(1.9, t.distance, rise));
        look.copy(t.to);
        fov = baseFov + 22 * (1 - rise);
        out.energy[t.toView] = 1 - rise;
        out.sky.copy(t.to);
      }
      veilColour.lerpColors(coreColours[t.fromView], coreColours[t.toView], smooth(u, 0.43, 0.51));
      veilOpacity = smooth(u, 0.33, 0.45) * (1 - smooth(u, 0.5, 0.78));
    },
    // Pull far out until both systems sit side by side, hold, then dive into the other.
    map(u, t) {
      const cut = cuts.map;
      w.copy(t.mapOffset).applyAxisAngle(up, 0.12 * (u - 0.5)).add(t.mapLook); // Slow drift over the hold.
      if (u < cut) {
        const rise = smoother(u / 0.42);
        pos.copy(t.from).add(t.offset).lerp(w, rise);
        look.lerpVectors(t.from, t.mapLook, rise);
      } else {
        const fall = smoother((u - cut) / (1 - cut));
        pos.copy(t.to).add(t.offset);
        pos.lerpVectors(w, pos, fall);
        look.lerpVectors(t.mapLook, t.to, fall);
      }
      // Far out, the backdrop centres on the camera so it stays behind everything.
      out.sky.copy(pos).sub(look).multiplyScalar(smooth(pos.distanceTo(look), 50, 95)).add(look);
      markerOpacity = smooth(u, 0.26, 0.4) * (1 - smooth(u, 0.6, 0.74));
    },
    // Fade to the background colour, cut, and settle in from slightly further out.
    dip(u, t) {
      const cut = cuts.dip;
      if (u < cut) {
        pos.copy(t.from).addScaledVector(t.offset, 1 + 0.05 * smooth(u, 0, cut));
        look.copy(t.from);
        out.sky.copy(t.from);
      } else {
        pos.copy(t.to).addScaledVector(t.offset, 1 + 0.1 * (1 - easeOut((u - cut) / (1 - cut))));
        look.copy(t.to);
        out.sky.copy(t.to);
      }
      veilColour.copy(background);
      veilOpacity = smooth(u, 0, 0.38) * (1 - smooth(u, 0.46, 1));
    },
  };

  const markerPoint = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  function placeMarkers() {
    markers.hidden = markerOpacity <= 0;
    if (markers.hidden) return;
    markers.style.opacity = String(markerOpacity);
    camera.updateMatrixWorld();
    cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const [view, centre] of [['active', trip.centres.active], ['completed', trip.centres.completed]]) {
      const label = markers.querySelector(`[data-view=${view}]`);
      markerPoint.copy(centre).addScaledVector(cameraUp, 11).project(camera);
      label.classList.toggle('destination', view === trip.toView);
      label.style.transform = `translate(${(markerPoint.x * 0.5 + 0.5) * innerWidth}px, ${(-markerPoint.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
    }
  }

  function apply() {
    camera.position.copy(pos);
    camera.lookAt(look);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    veil.hidden = veilOpacity <= 0.001;
    veil.style.opacity = String(veilOpacity);
    const [r, g, b] = veilColour.toArray().map(c => Math.round(c * 255));
    veil.style.background = veilGlow ? `radial-gradient(circle at 50% 50%, rgb(${r} ${g} ${b}) 0%, rgb(${r} ${g} ${b} / 0.35) 40%, rgb(${r} ${g} ${b} / 0) 75%)` : `rgb(${r} ${g} ${b})`;
    placeMarkers();
  }

  // from/to are system centres; target is where the camera currently looks.
  function start({ style, from, to, fromView, toView, target, centres, onCut, onDone }) {
    const offset = camera.position.clone().sub(target);
    const flat = new THREE.Vector3(offset.x, 0, offset.z);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
    trip = {
      style, from: from.clone(), to: to.clone(), fromView, toView, centres, offset, onCut, onDone,
      distance: offset.length(), dir: offset.clone().normalize(),
      // The overview looks a little left of the midpoint, so both systems sit clear of the task cards.
      mapLook: from.clone().add(to).multiplyScalar(0.5).addScaledVector(new THREE.Vector3().crossVectors(up, flat.normalize()), -18),
      mapOffset: flat.clone().multiplyScalar(64).addScaledVector(up, 121),
      elapsed: 0, duration: durations[style], cut: false,
    };
  }

  function update(delta) {
    if (!trip) return false;
    // Cap the step so a hitch (first sight of a new material) does not skip part of the move.
    trip.elapsed = Math.min(trip.elapsed + Math.min(delta, 1 / 20), trip.duration);
    const u = trip.elapsed / trip.duration;
    fov = baseFov; veilOpacity = 0; veilGlow = false; markerOpacity = 0; out.streak = 0;
    out.energy.active = out.energy.completed = 0;
    styles[trip.style](u, trip);
    apply();
    if (!trip.cut && u >= cuts[trip.style]) { trip.cut = true; trip.onCut(); }
    if (u >= 1) finish();
    return true;
  }

  // Lands immediately, e.g. when the window hides mid-journey.
  function finish() {
    if (!trip) return;
    const ended = trip;
    if (!ended.cut) { ended.cut = true; ended.onCut(); }
    pos.copy(ended.to).add(ended.offset);
    look.copy(ended.to);
    fov = baseFov; veilOpacity = 0; veilGlow = false; markerOpacity = 0; out.streak = 0;
    out.energy.active = out.energy.completed = 0;
    out.sky.copy(ended.to);
    apply();
    trip = null;
    ended.onDone();
  }

  return { start, update, finish, out, get active() { return !!trip; } };
}
