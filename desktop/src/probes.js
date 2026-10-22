// Notes in the scene. Every note is a small probe: one per linked task, orbiting its planet as a
// moon, or one resting at the station docks (then on the outer belt) when it has no links. The
// note's colour is the light on its antenna. See DISCUSSION.md, "Notes and probes".
import * as THREE from 'three';
import { DOCK_SLOTS, PALETTE, hash, noteHue, restingPlaces } from './notes-model.js';

const REST = null; // The link of a note's one unlinked probe.
const SIZE = 1.2;
const BELT_INNER = 11, BELT_OUTER = 11.8;
const CROSSING = 35; // Points past this x belong to the completed system.
const HALO = 0.38, HALO_OPACITY = 0.55;
const smoother = t => t * t * t * (t * (6 * t - 15) + 10);
const smooth = THREE.MathUtils.smoothstep;
const up = new THREE.Vector3(0, 1, 0);
const aim = new THREE.Matrix4();
// Turns `quaternion` so the probe's +z (its dish) faces `to`.
function face(quaternion, from, to) {
  if (from.distanceToSquared(to) < 1e-8) return quaternion;
  return quaternion.setFromRotationMatrix(aim.lookAt(to, from, up));
}
function rng(seed) {
  let value = seed >>> 0 || 1;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function createProbes({ scene, station, stationBody, stationMaterial, panelMaterial, radialSprite, centres, anchorOf, reducedMotion }) {
  const haloTexture = radialSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const dishMaterial = panelMaterial.clone();
  dishMaterial.side = THREE.DoubleSide;
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  // Low-poly parts in the station's metal, about a third of the smallest planet. +z is forward.
  const parts = {
    dish: [
      [new THREE.CylinderGeometry(0.032, 0.032, 0.07, 6).rotateX(Math.PI / 2), stationMaterial],
      [new THREE.ConeGeometry(0.082, 0.034, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.052), dishMaterial],
      [new THREE.CylinderGeometry(0.004, 0.004, 0.07, 4).rotateX(Math.PI / 2).translate(0, 0, 0.08), stationMaterial],
      [new THREE.CylinderGeometry(0.004, 0.004, 0.07, 4).translate(0, 0.065, -0.01), stationMaterial],
    ],
    satellite: [
      [new THREE.BoxGeometry(0.06, 0.06, 0.075), stationMaterial],
      [new THREE.BoxGeometry(0.12, 0.005, 0.055).translate(0.096, 0, 0), panelMaterial],
      [new THREE.BoxGeometry(0.12, 0.005, 0.055).translate(-0.096, 0, 0), panelMaterial],
      [new THREE.CylinderGeometry(0.004, 0.004, 0.07, 4).translate(0, 0.065, 0), stationMaterial],
    ],
  };
  const lampGeometry = new THREE.OctahedronGeometry(0.016, 0);
  const lampAt = new THREE.Vector3(0, 0.1, -0.005);
  const hitGeometry = new THREE.SphereGeometry(0.24, 6, 4);

  // Berths: ten around the habitat ring (turning with it) or staggered up and down the mast.
  // Each faces outward; an empty one shows a faint marker.
  const berths = { ring: [], rack: [] };
  const markerMaterial = new THREE.SpriteMaterial({ map: haloTexture, color: 0x79bfff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  function berth(parent, angle, radius, y) {
    const point = new THREE.Object3D();
    point.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    point.rotation.y = Math.PI / 2 - angle;
    const marker = new THREE.Sprite(markerMaterial);
    marker.scale.setScalar(0.13);
    point.add(marker);
    parent.add(point);
    return point;
  }
  for (let i = 0; i < DOCK_SLOTS; i++) berths.ring.push(berth(stationBody, i / DOCK_SLOTS * Math.PI * 2, 1.12, 0));
  for (let i = 0; i < DOCK_SLOTS; i++) {
    const upper = i < 7;
    berths.rack.push(berth(station, i * 2.39996, 0.36, upper ? 0.6 + i * 0.12 : -0.58 - (i - 7) * 0.12));
  }
  // The belt has a very faint dotted guide, shown only while a probe drifts there.
  const guidePoints = Array.from({ length: 240 }, (_, i) => {
    const a = i / 240 * Math.PI * 2, r = (BELT_INNER + BELT_OUTER) / 2;
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  });
  const guide = new THREE.Points(new THREE.BufferGeometry().setFromPoints(guidePoints), new THREE.PointsMaterial({ color: 0x79bfff, size: 0.05, transparent: true, opacity: 0.2, depthWrite: false }));
  guide.visible = false;
  scene.add(guide);

  const probes = [];
  const bursts = [];
  const slots = new Map(); // note id -> berth index, kept while the note stays docked.
  let notesById = new Map();
  let moonOrder = new Map(); // task id -> note ids orbiting it, in order.
  let style = 'dish', dockStyle = 'ring', returnStyle = 'flight', blink = true;
  let ready = false;
  let focusNote = null;
  let clock = 0;
  const target = new THREE.Vector3(), targetQuaternion = new THREE.Quaternion(), anchor = new THREE.Vector3(), offset = new THREE.Vector3();
  const anchorInfo = { radius: 0.4 };

  const colourOf = (note, mode) => mode === 'hashed'
    ? new THREE.Color().setHSL(noteHue(note) / 360, 0.75, 0.72, THREE.SRGBColorSpace)
    : new THREE.Color(PALETTE[note.palette % PALETTE.length]);
  const systemOf = point => point.x > CROSSING ? 'completed' : 'active';

  function build(probe) {
    probe.body.clear();
    for (const [geometry, material] of parts[style]) probe.body.add(new THREE.Mesh(geometry, material));
    probe.style = style;
  }
  function createProbe(note, link, colour) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    const lamp = new THREE.Mesh(lampGeometry, new THREE.MeshBasicMaterial({ color: colour.clone() }));
    lamp.position.copy(lampAt);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, color: colour.clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(lampAt);
    const hit = new THREE.Mesh(hitGeometry, hitMaterial);
    group.add(body, lamp, halo, hit);
    group.visible = false;
    const seed = hash(note.id + '|' + (link ?? ''));
    const random = rng(seed);
    const probe = {
      noteId: note.id, link, group, body, lamp, halo, hit, colour: colour.clone(),
      place: null, mode: 'placed', flight: null, exit: null, fade: 0, removing: false, snap: true, dark: false,
      tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 1.3, random() * Math.PI, (random() - 0.5) * 1.3)),
      moonPhase: random() * Math.PI * 2, spin: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(),
      nextBlink: 8 + random() * 30, blinkAge: Infinity,
    };
    hit.userData.probe = probe;
    build(probe);
    probes.push(probe);
    scene.add(group);
    return probe;
  }
  function dispose(probe) {
    scene.remove(probe.group);
    probe.lamp.material.dispose();
    probe.halo.material.dispose();
    probes.splice(probes.indexOf(probe), 1);
  }

  // Where a probe belongs right now. Returns 'lit', 'debris' (tumbling with a breaking planet),
  // 'dark' (gone below the horizon; position untouched) or 'gone' (its planet is hidden).
  function targetOf(probe, time) {
    const place = probe.place;
    if (place.kind === 'dock') {
      const point = berths[dockStyle][place.slot];
      point.getWorldPosition(target);
      point.getWorldQuaternion(targetQuaternion);
      return 'lit';
    }
    if (place.kind === 'belt') {
      const angle = place.angle + time * 0.012;
      target.set(Math.cos(angle) * place.radius, place.y, Math.sin(angle) * place.radius);
      face(targetQuaternion, target, anchor.set(0, place.y, 0));
      return 'lit';
    }
    const state = anchorOf(place.taskId, anchor, anchorInfo);
    if (!state) return 'gone';
    if (state === 'dark') return 'dark';
    // Each link has its own small tilted orbit, spaced by order so moons never overlap.
    const radius = anchorInfo.radius + 0.38 + place.index * 0.17;
    const angle = probe.moonPhase + time * 0.42 / (1 + place.index * 0.35);
    offset.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius).applyQuaternion(probe.tilt);
    target.copy(anchor).add(offset);
    face(targetQuaternion, target, anchor);
    return state === 'debris' ? 'debris' : 'lit';
  }
  function placeFor(note, link, resting) {
    if (link !== REST) {
      const order = moonOrder.get(link) ?? [];
      return { kind: 'moon', taskId: link, index: Math.max(0, order.indexOf(note.id)) };
    }
    if (resting.get(note.id) === 'docked') return { kind: 'dock', slot: slots.get(note.id), style: dockStyle };
    const random = rng(hash(note.id));
    return { kind: 'belt', angle: random() * Math.PI * 2, radius: BELT_INNER + random() * (BELT_OUTER - BELT_INNER), y: (random() - 0.5) * 0.3 };
  }
  const samePlace = (a, b) => a && b && a.kind === b.kind && a.slot === b.slot && a.style === b.style && a.taskId === b.taskId;

  function startFlight(probe, from, inbound = false) {
    // Coming back from interstellar space is never a crossing between systems.
    const crossing = !inbound && systemOf(from) !== systemOf(target);
    const kind = reducedMotion.matches ? 'jump' : crossing ? returnStyle : 'arc';
    const distance = from.distanceTo(target);
    probe.flight = {
      from: from.clone(), elapsed: 0, kind,
      duration: { arc: THREE.MathUtils.clamp(1.6 + distance * 0.16, 2, 4.5), flight: 7, jump: 1.6, core: 5 }[kind],
      lift: kind === 'flight' ? 9 : 0.5 + distance * 0.08,
      fromCore: centres[systemOf(from)], toCore: centres[systemOf(target)],
    };
    probe.mode = 'flight';
  }
  function startExit(probe) {
    // Interstellar: it burns out past the belt and fades into the stars.
    const from = probe.group.position.clone();
    const direction = from.clone().sub(centres[systemOf(from)]).setY(0).normalize().setY(0.25).normalize();
    probe.exit = { from, direction, elapsed: 0 };
    probe.mode = 'leaving';
  }
  function explode(probe) {
    const colour = probe.lamp.material.color;
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, color: colour.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flash.position.copy(probe.group.position).add(offset.copy(lampAt).applyQuaternion(probe.group.quaternion));
    const count = 22;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const random = rng(hash(probe.noteId) ^ Math.floor(clock * 1000));
    for (let i = 0; i < count; i++) {
      positions.set([probe.group.position.x, probe.group.position.y, probe.group.position.z], i * 3);
      velocities.push(new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(0.25 + random() * 0.65));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const shards = new THREE.Points(geometry, new THREE.PointsMaterial({ color: colour.clone().lerp(new THREE.Color(0x79bfff), 0.35), size: 0.045, transparent: true, depthWrite: false }));
    scene.add(flash, shards);
    bursts.push({ flash, shards, velocities, age: 0 });
    dispose(probe);
  }
  function remove(probe, animate) {
    if (!animate) { dispose(probe); return; }
    if (reducedMotion.matches || !probe.group.visible) { probe.removing = true; return; }
    explode(probe);
  }

  // Matches the snapshot's notes to probes. A note's first link takes its resting probe, its last
  // unlink brings that probe home, extra links launch from a sibling and extra unlinks fade out.
  function apply(snapshot, { animate, settle }) {
    const notes = snapshot.notes ?? [];
    const preferences = snapshot.preferences;
    const mode = preferences.noteColors;
    style = preferences.probeStyle === 'satellite' ? 'satellite' : 'dish';
    const previousDocks = dockStyle;
    dockStyle = preferences.dockStyle === 'rack' ? 'rack' : 'ring';
    // A dock style switch arrives as a quiet preference save, but docked probes still fly over.
    const restyle = ready && !settle && previousDocks !== dockStyle;
    returnStyle = ['flight', 'jump', 'core'].includes(preferences.probeReturn) ? preferences.probeReturn : 'flight';
    blink = preferences.probeBlink !== false;
    animate = animate && ready;
    notesById = new Map(notes.map(note => [note.id, note]));
    moonOrder = new Map();
    for (const note of notes.slice().sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))) {
      for (const link of note.links) moonOrder.set(link, [...(moonOrder.get(link) ?? []), note.id]);
    }
    const resting = restingPlaces(notes);
    for (const id of [...slots.keys()]) if (resting.get(id) !== 'docked') slots.delete(id);
    const used = new Set(slots.values());
    for (const [id, place] of resting) {
      if (place !== 'docked' || slots.has(id)) continue;
      let slot = 0;
      while (used.has(slot)) slot++;
      slots.set(id, slot); used.add(slot);
    }
    for (const probe of [...probes]) if (!probe.removing && !notesById.has(probe.noteId)) remove(probe, animate);
    for (const note of notes) {
      const colour = colourOf(note, mode);
      const wanted = note.links.length ? note.links : [REST];
      const have = probes.filter(probe => probe.noteId === note.id && !probe.removing);
      const oldOnes = have.filter(probe => !wanted.includes(probe.link));
      const newLinks = wanted.filter(link => !have.some(probe => probe.link === link));
      const kept = have.filter(probe => wanted.includes(probe.link));
      // Rest -> first link, or last link -> rest: the same probe moves.
      if (oldOnes.length && newLinks.length && (oldOnes.some(probe => probe.link === REST) || newLinks.includes(REST))) {
        const probe = oldOnes.find(probe => probe.link === REST) ?? oldOnes[0];
        oldOnes.splice(oldOnes.indexOf(probe), 1);
        probe.link = newLinks.shift();
        kept.push(probe);
      }
      for (const probe of oldOnes) { if (animate) probe.removing = true; else dispose(probe); }
      const sibling = kept.find(probe => probe.group.visible);
      for (const link of newLinks) {
        const probe = createProbe(note, link, colour);
        probe.lamp.material.color.copy(colour); probe.halo.material.color.copy(colour);
        if (animate && sibling) { probe.group.position.copy(sibling.group.position); probe.group.quaternion.copy(sibling.group.quaternion); probe.launch = true; }
        probe.snap = !animate || !sibling;
        probe.fadeIn = animate;
        kept.push(probe);
      }
      for (const probe of kept) {
        probe.colour.copy(colour);
        if (probe.style !== style) build(probe);
        const place = placeFor(note, probe.link, resting);
        const moved = !samePlace(place, probe.place);
        const before = probe.place;
        probe.place = place;
        if (!animate && !(restyle && place.kind === 'dock')) { if (moved) probe.snap = true; continue; }
        if (moved && before && probe.group.visible && probe.mode !== 'away' && probe.mode !== 'leaving') probe.pendingFlight = true;
        if (probe.launch) { probe.pendingFlight = true; probe.launch = false; }
      }
    }
    if (settle) for (const probe of probes) if (!probe.removing) probe.snap = true;
    ready = true;
  }

  function updateProbe(probe, delta, step, time) {
    const lamp = probe.lamp.material.color;
    lamp.lerp(probe.colour, 1 - Math.exp(-delta * 4)); // Colour mode switches cross-fade.
    probe.halo.material.color.copy(lamp);
    if (probe.removing) {
      probe.fade = Math.max(0, probe.fade - delta / 0.7);
      if (probe.fade === 0) { dispose(probe); return; }
      return finish(probe, delta);
    }
    const state = targetOf(probe, time);
    if (probe.snap) {
      probe.snap = false;
      probe.flight = probe.exit = null;
      probe.pendingFlight = false;
      if (state === 'gone') { probe.mode = 'away'; probe.fade = 0; return finish(probe, delta); }
      probe.mode = 'placed';
      if (state !== 'dark') { probe.group.position.copy(target); probe.group.quaternion.copy(targetQuaternion); }
      probe.fade = probe.fadeIn ? 0 : state === 'dark' ? 0 : 1;
      probe.fadeIn = false;
    }
    if (state === 'gone') {
      if (probe.mode !== 'leaving' && probe.mode !== 'away') {
        if (probe.group.visible && !reducedMotion.matches) startExit(probe);
        else { probe.mode = 'away'; probe.fade = 0; }
      }
    } else if (probe.mode === 'away' || probe.mode === 'leaving') {
      // Back in range: it returns from where it left, or blinks in under reduced motion.
      const from = probe.exit ? probe.exit.from.clone().addScaledVector(probe.exit.direction, 40)
        : target.clone().addScaledVector(offset.copy(target).sub(centres[systemOf(target)]).setY(0).normalize().setY(0.25).normalize(), 40);
      probe.exit = null;
      probe.mode = 'placed';
      if (reducedMotion.matches) { probe.group.position.copy(target); probe.fade = 0; }
      else { probe.group.position.copy(from); startFlight(probe, from, true); }
    }
    if (probe.pendingFlight && state !== 'gone') {
      probe.pendingFlight = false;
      if (state !== 'dark') startFlight(probe, probe.group.position);
    }
    if (probe.mode === 'leaving') {
      const exit = probe.exit;
      exit.elapsed += delta / 3.2;
      const t = Math.min(exit.elapsed, 1);
      probe.group.position.copy(exit.from).addScaledVector(exit.direction, t * t * 40);
      probe.burn = Math.sin(Math.PI * Math.min(t * 1.6, 1)) * 1.2;
      probe.fade = 1 - smooth(t, 0.45, 1);
      face(probe.group.quaternion, probe.group.position, offset.copy(probe.group.position).add(exit.direction));
      if (t >= 1) probe.mode = 'away';
      return finish(probe, delta);
    }
    if (probe.mode === 'away') { probe.fade = 0; return finish(probe, delta); }
    if (probe.mode === 'flight') {
      const flight = probe.flight;
      flight.elapsed += delta;
      const t = Math.min(flight.elapsed / flight.duration, 1);
      const position = probe.group.position;
      if (flight.kind === 'jump') {
        // Blink out where it was, blink in where it goes.
        if (t < 0.5) { position.copy(flight.from); probe.fade = 1 - smooth(t, 0, 0.35); }
        else { position.copy(target); probe.fade = smooth(t, 0.65, 1); probe.group.quaternion.copy(targetQuaternion); }
      } else if (flight.kind === 'core') {
        // Dive into the core it leaves, emerge from the core it reaches.
        if (t < 0.45) { position.lerpVectors(flight.from, flight.fromCore, smoother(t / 0.45)); probe.fade = 1 - smooth(t, 0.3, 0.45); }
        else if (t < 0.55) probe.fade = 0;
        else { position.lerpVectors(flight.toCore, target, smoother((t - 0.55) / 0.45)); probe.fade = smooth(t, 0.55, 0.7); }
        face(probe.group.quaternion, position, t < 0.5 ? flight.fromCore : target);
      } else {
        const e = smoother(t);
        const previous = offset.copy(position);
        position.lerpVectors(flight.from, target, e);
        position.y += flight.lift * Math.sin(Math.PI * e);
        probe.fade = Math.min(1, probe.fade + delta * 2);
        if (t < 0.92) face(probe.group.quaternion, previous, position.distanceToSquared(previous) > 1e-10 ? offset.copy(position).multiplyScalar(2).sub(previous) : target);
        else probe.group.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 6));
      }
      if (t >= 1) { probe.flight = null; probe.mode = 'placed'; probe.fade = Math.max(probe.fade, state === 'dark' ? 0 : 1); }
      return finish(probe, delta);
    }
    // Placed: follow the target. A reopened planet jumps systems, so its moons travel after it.
    if (state === 'dark') {
      probe.dark = true;
      probe.fade = Math.max(0, probe.fade - delta / 0.6);
      return finish(probe, delta);
    }
    if (probe.dark && probe.fade === 0) { probe.group.position.copy(target); probe.group.quaternion.copy(targetQuaternion); }
    probe.dark = false;
    if (probe.fade > 0.5 && systemOf(target) !== systemOf(probe.group.position)) { startFlight(probe, probe.group.position); return finish(probe, delta); }
    probe.group.position.copy(target);
    if (state === 'debris') probe.group.quaternion.multiply(targetQuaternion.setFromAxisAngle(probe.spin, step * 2.4));
    else probe.group.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 5));
    probe.fade = Math.min(1, probe.fade + delta * 1.5);
    finish(probe, delta);
  }
  // Light and visibility. Hover or selection brightens every probe of that note.
  function finish(probe, delta) {
    const group = probe.group;
    group.visible = probe.fade > 0.01;
    group.scale.setScalar(SIZE * Math.max(probe.fade, 0.001));
    if (blink && !reducedMotion.matches) {
      probe.nextBlink -= delta;
      if (probe.nextBlink <= 0) { probe.blinkAge = 0; probe.nextBlink = 20 + Math.random() * 20; }
    }
    probe.blinkAge += delta;
    const pulse = probe.blinkAge < 1.8 ? Math.sin(Math.PI * probe.blinkAge / 1.8) ** 2 : 0;
    const focus = probe.noteId === focusNote ? 1 : 0;
    const burn = probe.mode === 'leaving' ? probe.burn : 0;
    probe.halo.material.opacity = Math.min(1, HALO_OPACITY + pulse * 0.4 + focus * 0.45 + burn) * probe.fade;
    probe.halo.scale.setScalar(HALO * (1 + pulse * 0.35 + focus * 0.55 + burn));
  }
  function updateBursts(delta) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const burst = bursts[i];
      burst.age += delta;
      const t = burst.age / 1.5;
      burst.flash.scale.setScalar(0.25 + smooth(burst.age, 0, 0.25) * 0.9);
      burst.flash.material.opacity = 1 - smooth(burst.age, 0.05, 0.6);
      const attribute = burst.shards.geometry.attributes.position;
      const drag = Math.exp(-delta * 1.4);
      burst.velocities.forEach((velocity, k) => {
        attribute.setXYZ(k, attribute.getX(k) + velocity.x * delta, attribute.getY(k) + velocity.y * delta, attribute.getZ(k) + velocity.z * delta);
        velocity.multiplyScalar(drag);
      });
      attribute.needsUpdate = true;
      burst.shards.material.opacity = 1 - smooth(t, 0.4, 1);
      if (t >= 1) {
        scene.remove(burst.flash, burst.shards);
        burst.flash.material.dispose(); burst.shards.material.dispose(); burst.shards.geometry.dispose();
        bursts.splice(i, 1);
      }
    }
  }
  // Orbits and drift follow simulation time, so Pause motion stops them. Flights, fades and
  // explosions answer the user's own actions and run on real time.
  function update(delta, step, time) {
    clock += delta;
    for (const probe of [...probes]) updateProbe(probe, delta, step, time);
    updateBursts(delta);
    const occupied = new Set(probes.filter(probe => probe.place?.kind === 'dock' && !probe.removing).map(probe => probe.place.slot));
    for (const [name, list] of Object.entries(berths)) list.forEach((point, i) => { point.children[0].visible = name === dockStyle && !occupied.has(i); });
    guide.visible = probes.some(probe => probe.place?.kind === 'belt' && !probe.removing);
  }
  function settle() {
    for (const probe of [...probes]) { if (probe.removing) dispose(probe); else { probe.snap = true; probe.fadeIn = false; } }
    for (const burst of bursts.splice(0)) {
      scene.remove(burst.flash, burst.shards);
      burst.flash.material.dispose(); burst.shards.material.dispose(); burst.shards.geometry.dispose();
    }
  }
  const pickable = probe => probe.group.visible && probe.fade > 0.5 && !probe.removing && probe.mode !== 'leaving';
  return {
    apply, update, settle,
    pick(raycaster, view) {
      const hits = probes.filter(probe => pickable(probe) && systemOf(probe.group.position) === view).map(probe => probe.hit);
      return raycaster.intersectObjects(hits, false)[0]?.object.userData.probe ?? null;
    },
    alive: probe => probes.includes(probe) && !probe.removing,
    systemOf: probe => systemOf(probe.group.position),
    // Where the light sits, for tags and the callout.
    lightOf: (probe, out) => out.copy(lampAt).multiplyScalar(SIZE).applyQuaternion(probe.group.quaternion).add(probe.group.position),
    settled: probe => probe.mode === 'placed' && !probe.removing && probe.fade > 0.5,
    setFocus(noteId) { focusNote = noteId; },
  };
}
