// The whole page is one sky. Scroll flies the camera from deep space through the waiting ring,
// the ClickUp and Redmine orbits and the core, up to a map view, and settles in Zen. The pointer
// (or a finger) is a small mass: the field, the orbit lines and nearby planets dip toward it.
// Look and numbers follow desktop/src/scene.js: rings at 4.2 / 7.1 / 9.5, the rock core, the disc.
import * as THREE from 'three';

const canvas = document.querySelector('[data-sky]');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
} catch {
  document.documentElement.classList.add('no-webgl');
  throw new Error('WebGL unavailable; the page reads without the sky.');
}
renderer.setClearColor(0x0c1222);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 220);
scene.add(new THREE.AmbientLight(0xa6c9e8, 1.4));
const key = new THREE.DirectionalLight(0xe3f3ff, 4);
key.position.set(-6, 9, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x79bfff, 3.5);
rim.position.set(5, 2, -5);
scene.add(rim);
const coreLight = new THREE.PointLight(0x79cfff, 28, 18, 2);
coreLight.position.set(0, 1, 0);
scene.add(coreLight);

let seed = 19;
function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function rock(radius, color, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const colors = [];
  for (let i = 0; i < geometry.attributes.position.count; i += 3) {
    const shade = new THREE.Color(color).multiplyScalar(0.72 + random() * 0.4);
    for (let j = 0; j < 3; j++) colors.push(shade.r, shade.g, shade.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0.12 }));
}

// ---- The well ------------------------------------------------------------------------------
// Everything that bends keeps its rest positions; each frame bends them toward the well.
const well = { x: 0, z: 0, tx: 0, tz: 0, strength: 0, target: 0 };
function pull(x, z, reach) {
  const dx = well.x - x, dz = well.z - z;
  const falloff = well.strength * Math.exp(-(dx * dx + dz * dz) / (reach * reach));
  return { dx: dx * falloff, dz: dz * falloff, falloff };
}
const benders = [];
function bendable(object, scale = 1) {
  const position = object.geometry.attributes.position;
  benders.push({ position, rest: Float32Array.from(position.array), scale });
}
function bendAll() {
  for (const { position, rest, scale } of benders) {
    const a = position.array;
    for (let i = 0; i < a.length; i += 3) {
      const { dx, dz, falloff } = pull(rest[i], rest[i + 2], 2.6);
      a[i] = rest[i] + dx * 0.35 * scale;
      a[i + 1] = rest[i + 1] - falloff * 1.1 * scale;
      a[i + 2] = rest[i + 2] + dz * 0.35 * scale;
    }
    position.needsUpdate = true;
  }
}

function ring(radius, color, opacity, dashed = false) {
  const points = Array.from({ length: 361 }, (_, i) => {
    const angle = i / 360 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.12, gapSize: 0.16 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  line.computeLineDistances();
  scene.add(line);
  bendable(line);
}
function glow(radius, color, width, opacity) {
  const geometry = new THREE.RingGeometry(radius - width, radius + width, 240, 1);
  geometry.rotateX(-Math.PI / 2); // world-space vertices, so the well can bend them directly
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(mesh);
  bendable(mesh);
}
const RINGS = { Redmine: 4.2, ClickUp: 7.1 };
const WAITING = 9.5;
const CORE = 1.45;
ring(RINGS.Redmine, 0x79bfff, 0.9);
glow(RINGS.Redmine, 0x79bfff, 0.05, 0.28); glow(RINGS.Redmine, 0x79bfff, 0.2, 0.06);
ring(RINGS.ClickUp, 0x9de5f5, 0.8);
glow(RINGS.ClickUp, 0x79bfff, 0.05, 0.22); glow(RINGS.ClickUp, 0x79bfff, 0.22, 0.05);
ring(WAITING, 0x64789b, 0.3, true);

const core = rock(CORE, 0x1e3554, 2);
core.rotation.z = 0.22;
scene.add(core);

const disc = document.createElement('canvas');
disc.width = disc.height = 512;
{
  const g = disc.getContext('2d'), s = 512, c = s / 2;
  const fade = g.createRadialGradient(c, c, s * 0.23, c, c, s / 2);
  fade.addColorStop(0, 'rgba(162,211,255,0.75)'); fade.addColorStop(0.35, 'rgba(121,191,255,0.32)'); fade.addColorStop(1, 'rgba(121,191,255,0)');
  g.fillStyle = fade; g.fillRect(0, 0, s, s);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const r = s * (0.25 + random() * 0.24);
    const start = random() * Math.PI * 2;
    g.strokeStyle = `rgba(${random() < 0.3 ? '157,229,245' : '162,211,255'},${0.08 + random() * 0.3 * (1 - (r / s - 0.25) * 3)})`;
    g.lineWidth = 0.6 + random() * 2.2;
    g.beginPath(); g.arc(c, c, r, start, start + 0.4 + random() * 1.6); g.stroke();
  }
}
const discTexture = new THREE.CanvasTexture(disc);
discTexture.colorSpace = THREE.SRGBColorSpace;
const accretion = new THREE.Mesh(new THREE.RingGeometry(1.55, 3.3, 128, 1), new THREE.MeshBasicMaterial({ map: discTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
accretion.rotation.x = -Math.PI / 2 + 0.12;
scene.add(accretion);

// Dust belt between the ClickUp ring and the waiting ring.
const DUST = 140;
const dust = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshStandardMaterial({ color: 0x354563, roughness: 1, flatShading: true }), DUST);
const dustRest = Array.from({ length: DUST }, () => ({
  angle: random() * Math.PI * 2, radius: 8.1 + random() * 0.65, y: (random() - 0.5) * 0.35,
  rx: random() * 3, ry: random() * 3, scale: 0.4 + random() * 1.7,
}));
scene.add(dust);

// The fine field: thousands of grains that drift on Keplerian paths and pour into the well.
const FIELD = 2600;
const fieldRest = new Float32Array(FIELD * 3); // angle, radius, height
for (let i = 0; i < FIELD; i++) {
  fieldRest[i * 3] = random() * Math.PI * 2;
  fieldRest[i * 3 + 1] = 1.9 + Math.pow(random(), 0.85) * 12.5;
  fieldRest[i * 3 + 2] = (random() - 0.5) * 0.5;
}
const fieldGeometry = new THREE.BufferGeometry();
fieldGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FIELD * 3), 3));
const grain = document.createElement('canvas');
grain.width = grain.height = 32;
{
  const g = grain.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill();
}
const field = new THREE.Points(fieldGeometry, new THREE.PointsMaterial({ size: 0.085, map: new THREE.CanvasTexture(grain), color: 0xa2d3ff, transparent: true, opacity: 0.75, depthWrite: false, alphaTest: 0.1 }));
scene.add(field);

const starPositions = [], starColors = [];
for (let i = 0; i < 1800; i++) {
  const theta = random() * Math.PI * 2, y = random() * 2 - 1, h = Math.sqrt(1 - y * y), d = 90 + random() * 40;
  starPositions.push(h * Math.cos(theta) * d, y * d, h * Math.sin(theta) * d);
  const color = new THREE.Color().setHSL(0.55 + random() * 0.07, 0.3, 0.3 + random() * 0.5).multiplyScalar(0.95);
  starColors.push(color.r, color.g, color.b);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, sizeAttenuation: true })));

// ---- Planets -------------------------------------------------------------------------------
const WAIT_COLOR = new THREE.Color(0x64789b);
const ACTIVE_COLOR = { Redmine: new THREE.Color(0x79bfff), ClickUp: new THREE.Color(0xa2d3ff) };
const SPEED = { Redmine: 0.16, ClickUp: 0.085 };
const labelLayer = document.querySelector('[data-labels]');
const planets = new Map();
const roster = [
  ['Lyra', 'Redmine', 'active', 0.3, 'Fix login redirect'],
  ['Vega', 'Redmine', 'active', 1.9, 'Rate-limit the export API'],
  ['Elara', 'Redmine', 'active', 3.4, 'Migrate cron jobs'],
  ['Orion', 'Redmine', 'active', 4.9, 'Review invoice totals'],
  ['Mira', 'ClickUp', 'active', 0.9, 'Dashboard wireframes'],
  ['Atlas', 'ClickUp', 'active', 2.2, 'Onboarding copy'],
  ['Nova', 'ClickUp', 'active', 3.6, 'Sprint retro notes'],
  ['Juno', 'ClickUp', 'active', 4.6, 'Icon set for settings'],
  ['Halo', 'ClickUp', 'active', 5.7, 'Empty states'],
  ['Echo', 'Redmine', 'waiting', 0.42, 'Update the API docs'],
  ['Solace', 'ClickUp', 'waiting', 1.5, 'Pricing page audit'],
  ['Cinder', 'Redmine', 'waiting', 2.75, 'Flaky upload test'],
  ['Iris', 'ClickUp', 'waiting', 3.9, 'Customer interviews'],
  ['Rhea', 'Redmine', 'waiting', 5.1, 'Upgrade Postgres'],
  ['Talos', 'ClickUp', 'waiting', 5.95, 'Release checklist'],
];
function makeMesh(p) {
  const mesh = rock(p.size, 0xffffff);
  mesh.material.color.copy(p.state === 'waiting' ? WAIT_COLOR : ACTIVE_COLOR[p.source]);
  mesh.rotation.set(random() * 3, random() * 3, random() * 3);
  scene.add(mesh);
  return mesh;
}
for (const [name, source, state, angle, task] of roster) {
  const p = { name, source, state, home: state, angle, task, size: 0.38 + random() * 0.2, spin: 0.2 + random() * 0.3, born: 1, job: null, listeners: new Set() };
  p.orbit = state === 'waiting' ? WAITING : RINGS[source];
  p.mesh = makeMesh(p);
  p.label = document.createElement('div');
  p.label.className = 'label';
  p.label.innerHTML = `<b></b><small></small>`;
  p.label.firstChild.textContent = name;
  labelLayer.append(p.label);
  planets.set(name, p);
}
const statusText = p => ({ waiting: 'Not started', entering: 'Entering orbit', active: 'In progress', leaving: 'De-orbiting', decaying: 'Crossing the event horizon', gone: 'Done' })[p.state];
function changed(p) {
  p.label.lastChild.textContent = `${p.source} · ${statusText(p)}`;
  p.label.classList.toggle('label--waiting', p.state === 'waiting');
  for (const fn of p.listeners) fn(p);
}
planets.forEach(changed);

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function transfer(p, to, state, color) {
  p.state = state;
  p.job = { t: 0, duration: 5, from: p.orbit, to, colorFrom: p.mesh.material.color.clone(), colorTo: color };
  changed(p);
}
const actions = {
  enter: p => p.state === 'waiting' && transfer(p, RINGS[p.source], 'entering', ACTIVE_COLOR[p.source]),
  deorbit: p => p.state === 'active' && transfer(p, WAITING, 'leaving', WAIT_COLOR),
  complete: p => {
    if (p.state !== 'active') return;
    p.state = 'decaying';
    p.job = { t: 0, duration: 5.5, from: p.orbit };
    changed(p);
  },
};

const debris = [];
let flare = 0;
function crumble(p) {
  const { x, z } = p.mesh.position;
  for (let i = 0; i < 14; i++) {
    const chunk = rock(0.07 + random() * 0.09, 0xffffff, 0);
    chunk.material.color.copy(p.mesh.material.color);
    chunk.material.transparent = true;
    debris.push({ mesh: chunk, angle: Math.atan2(z, x) + (random() - 0.5) * 0.6, from: Math.hypot(x, z) + (random() - 0.5) * 0.5, t: 0, duration: 5 + random() * 2.5, y: (random() - 0.5) * 0.3 });
    scene.add(chunk);
  }
  p.mesh.visible = false;
  p.state = 'gone';
  p.job = { t: 0, duration: 7 }; // then it forms again, so the next visitor finds it
  changed(p);
}
function reform(p) {
  p.state = p.home;
  p.orbit = p.home === 'waiting' ? WAITING : RINGS[p.source];
  p.angle = Math.atan2(p.mesh.position.z, p.mesh.position.x) + Math.PI * 0.6;
  p.mesh.material.color.copy(p.home === 'waiting' ? WAIT_COLOR : ACTIVE_COLOR[p.source]);
  p.mesh.visible = true;
  p.born = 0;
  p.job = null;
  changed(p);
}

let ambientClock = 0;
const featured = new Set(['Echo', 'Mira', 'Lyra']);
function ambient(dt, allowed) {
  ambientClock += dt;
  if (!allowed || ambientClock < 8) return;
  ambientClock = 0;
  const pool = [...planets.values()].filter(p => !featured.has(p.name));
  const waiting = pool.filter(p => p.state === 'waiting');
  const active = pool.filter(p => p.state === 'active');
  if (random() < 0.5 && waiting.length) actions.enter(waiting[Math.floor(random() * waiting.length)]);
  else if (active.length > 4) actions.complete(active[Math.floor(random() * active.length)]);
  else if (active.length) actions.deorbit(active[Math.floor(random() * active.length)]);
}

const dummy = new THREE.Object3D();
function step(dt, time) {
  for (const p of planets.values()) {
    if (p.state === 'gone') {
      p.job.t += dt / p.job.duration;
      if (p.job.t >= 1) reform(p);
      continue;
    }
    let speed = p.state === 'waiting' ? 0 : SPEED[p.source] * Math.pow(RINGS[p.source] / p.orbit, 1.5);
    if (p.born < 1) {
      p.born = Math.min(1, p.born + dt / 2.5);
      p.mesh.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - p.born, 3)));
    }
    if (p.state === 'entering' || p.state === 'leaving') {
      const job = p.job;
      job.t = Math.min(1, job.t + dt / job.duration);
      const k = ease(job.t);
      p.orbit = job.from + (job.to - job.from) * k;
      p.mesh.material.color.copy(job.colorFrom).lerp(job.colorTo, k);
      const full = SPEED[p.source] * Math.pow(RINGS[p.source] / p.orbit, 1.5);
      speed = full * (p.state === 'entering' ? k : 1 - k);
      if (job.t >= 1) { p.state = p.state === 'entering' ? 'active' : 'waiting'; p.orbit = job.to; p.job = null; changed(p); }
    } else if (p.state === 'decaying') {
      const job = p.job;
      job.t = Math.min(1, job.t + dt / job.duration);
      p.orbit = job.from + (2.0 - job.from) * job.t * job.t;
      speed = Math.min(1.6, SPEED[p.source] * Math.pow(RINGS[p.source] / p.orbit, 1.5));
      if (job.t >= 1) { crumble(p); continue; }
    }
    p.angle += speed * dt;
    const x = Math.cos(p.angle) * p.orbit, z = Math.sin(p.angle) * p.orbit;
    const { dx, dz, falloff } = pull(x, z, 2.4);
    p.mesh.position.set(x + dx * 0.25, Math.sin(p.angle * 2) * 0.08 - falloff * 0.7, z + dz * 0.25);
    p.mesh.rotation.y += p.spin * dt;
  }
  for (const d of [...debris]) {
    d.t = Math.min(1, d.t + dt / d.duration);
    const r = d.from + (CORE * 0.9 - d.from) * (1 - Math.pow(1 - d.t, 2.2));
    d.angle += Math.min(2.4, 0.16 * Math.pow(4.2 / r, 1.5)) * dt;
    d.mesh.position.set(Math.cos(d.angle) * r, d.y * (1 - d.t), Math.sin(d.angle) * r);
    d.mesh.rotation.x += dt * 2;
    d.mesh.material.opacity = 1 - Math.max(0, d.t - 0.85) / 0.15;
    if (d.t >= 1) {
      scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      debris.splice(debris.indexOf(d), 1);
      flare = Math.min(1, flare + 0.2);
    }
  }
  flare = Math.max(0, flare - dt * 0.6);
  coreLight.intensity = 28 + flare * 60;
  core.scale.setScalar(1 + flare * 0.06);
  core.rotation.y += dt * 0.05;
  accretion.rotation.z -= dt * (0.12 + flare * 0.4);

  // The field drifts on its own orbits and pours toward the well.
  const a = fieldGeometry.attributes.position.array;
  for (let i = 0; i < FIELD; i++) {
    const r = fieldRest[i * 3 + 1];
    const angle = fieldRest[i * 3] + time * 0.05 * Math.pow(4.2 / r, 1.5);
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    const { falloff } = pull(x, z, 2.2);
    const take = Math.min(0.85, 1.4 * falloff);
    a[i * 3] = x + (well.x - x) * take;
    a[i * 3 + 1] = fieldRest[i * 3 + 2] - falloff * 1.3;
    a[i * 3 + 2] = z + (well.z - z) * take;
  }
  fieldGeometry.attributes.position.needsUpdate = true;
  for (let i = 0; i < DUST; i++) {
    const d = dustRest[i];
    const x = Math.cos(d.angle) * d.radius, z = Math.sin(d.angle) * d.radius;
    const { dx, dz, falloff } = pull(x, z, 2.4);
    dummy.position.set(x + dx * 0.5, d.y - falloff * 1.1, z + dz * 0.5);
    dummy.rotation.set(d.rx, d.ry + time * 0.1, 0);
    dummy.scale.setScalar(d.scale);
    dummy.updateMatrix();
    dust.setMatrixAt(i, dummy.matrix);
  }
  dust.instanceMatrix.needsUpdate = true;
  bendAll();
}

// ---- Camera stops --------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const narrow = () => camera.aspect < 0.9;
function follow(name, out, up, side, ahead) {
  return () => {
    const p = planets.get(name);
    const P = p.mesh.position.clone();
    const u = V(P.x, 0, P.z).normalize();
    const t = V(-u.z, 0, u.x);
    const pull = narrow() ? 1.45 : 1;
    return {
      pos: P.clone().addScaledVector(u, out * pull).addScaledVector(t, side * pull).add(V(0, up * pull, 0)),
      target: P.clone().addScaledVector(t, ahead).addScaledVector(u, -1.2),
    };
  };
}
// The hero, the map and Zen frame the whole system in the free area the words leave, at any
// window size: a distance that makes it fit, then a view offset that moves its centre there.
const probe = new THREE.PerspectiveCamera(39, 1, 0.1, 220);
const extremes = [V(10.6, 0, 0), V(-10.6, 0, 0), V(0, 0, 10.6), V(0, 0, -10.6), V(0, 1.7, 0)];
function fitRect(dir, { left = 0, right = innerWidth, top, bottom }) {
  const w = innerWidth, h = innerHeight;
  const band = Math.max(140, bottom - top), span = Math.max(160, right - left);
  probe.aspect = w / h;
  probe.updateProjectionMatrix();
  probe.position.copy(dir).multiplyScalar(40);
  probe.lookAt(0, 0, 0);
  probe.updateMatrixWorld();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of extremes) {
    const v = point.clone().project(probe);
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const scale = Math.max((maxY - minY) / (band * 0.9), (maxX - minX) / (span * 0.94));
  const middleY = ((minY + maxY) / 2 - h / 2) / scale + h / 2;
  const middleX = ((minX + maxX) / 2 - w / 2) / scale + w / 2;
  return { distance: 40 * scale, shift: middleY - (top + bottom) / 2, shiftX: middleX - (left + right) / 2 };
}
const heroWords = document.querySelector('.hero');
const zenWords = document.querySelector('.zen');
const zenFoot = document.querySelector('.foot');
const mapLine = document.querySelector('.chapter--map .line');
const mapCard = document.querySelector('.chapter--map .sync');
const HERO_DIR = V(0, 19, 35).normalize();
const ZEN_DIR = V(0, 15.5, 28).normalize();
const MAP_DIR = V(0, 31, 0.8).normalize();
let heroFit = { distance: 40, shift: 0 }, zenFit = { distance: 32, shift: 0 }, mapFit = { distance: 31, shift: 0, shiftX: 0 };
function fit() {
  heroFit = fitRect(HERO_DIR, { top: 84, bottom: heroWords.offsetTop - 20 });
  const zenBottom = zenWords.offsetTop + Math.max(...[...zenWords.children].map(el => el.offsetTop + el.offsetHeight));
  zenFit = fitRect(ZEN_DIR, { top: zenBottom + 20, bottom: zenFoot.offsetTop - 20 });
  // Side by side on wide screens (words and card on the left), stacked between them on phones.
  mapFit = innerWidth >= 760
    ? fitRect(MAP_DIR, { left: Math.max(mapLine.offsetLeft + mapLine.offsetWidth, mapCard.offsetLeft + mapCard.offsetWidth) + 48, right: innerWidth - 24, top: 84, bottom: innerHeight - 24 })
    : fitRect(MAP_DIR, { top: mapLine.offsetTop + mapLine.offsetHeight + 12, bottom: mapCard.offsetTop - 12 });
}
addEventListener('resize', fit);
document.fonts?.ready.then(fit);
fit();
const stops = [
  () => ({ pos: HERO_DIR.clone().multiplyScalar(heroFit.distance), target: V(0, 0, 0), shift: heroFit.shift }),
  follow('Echo', 5.2, 2.2, -3.4, 0.6),
  follow('Mira', 4.6, 2.0, -3.2, 0.5),
  follow('Lyra', 4.4, 2.0, -3.0, 0.4),
  () => ({ pos: narrow() ? V(1.4, 4.8, 10.5) : V(2.8, 2.6, 8.2), target: V(0, -1.3, 0) }),
  () => ({ pos: MAP_DIR.clone().multiplyScalar(mapFit.distance), target: V(0, 0, 0), shift: mapFit.shift, shiftX: mapFit.shiftX }),
  time => {
    const a = time * 0.025, d = zenFit.distance;
    return { pos: V(Math.sin(a) * ZEN_DIR.z * d, ZEN_DIR.y * d, Math.cos(a) * ZEN_DIR.z * d), target: V(0, 0, 0), shift: zenFit.shift };
  },
];
const smooth = t => t * t * (3 - 2 * t);
function shot(s, time) {
  const i = Math.max(0, Math.min(stops.length - 1, Math.floor(s)));
  const j = Math.min(stops.length - 1, i + 1);
  const f = smooth(Math.max(0, Math.min(1, (s - i - 0.4) / 0.6)));
  const A = stops[i](time), B = stops[j](time);
  return { pos: A.pos.lerp(B.pos, f), target: A.target.lerp(B.target, f), shift: (A.shift ?? 0) * (1 - f) + (B.shift ?? 0) * f, shiftX: (A.shiftX ?? 0) * (1 - f) + (B.shiftX ?? 0) * f };
}

// ---- Scroll, pointer, page wiring ----------------------------------------------------------
const chapters = [...document.querySelectorAll('[data-stop]')];
let progress = 0;
function measure() {
  const y = scrollY;
  let s = 0;
  chapters.forEach((el, i) => {
    const top = el.offsetTop, height = el.offsetHeight;
    if (y >= top) s = i + Math.min(1, (y - top) / height);
  });
  progress = s;
  return s;
}

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();
function aim(clientX, clientY) {
  ndc.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(plane, hit) && Math.hypot(hit.x, hit.z) < 16) {
    well.tx = hit.x; well.tz = hit.z; well.target = 1;
  } else well.target = 0;
}
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') aim(e.clientX, e.clientY); }, { passive: true });
document.addEventListener('pointerleave', () => { well.target = 0; });
addEventListener('touchstart', e => aim(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
addEventListener('touchmove', e => aim(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
addEventListener('touchend', () => { well.target = 0; }, { passive: true });

// Glass callouts, rebuilt from the app, follow their planet while their chapter is on screen.
const cards = [...document.querySelectorAll('[data-card]')].map(el => {
  const p = planets.get(el.dataset.card);
  const chapter = chapters.indexOf(el.closest('[data-stop]'));
  const title = el.querySelector('[data-task]'), meta = el.querySelector('[data-meta]');
  const buttons = Object.fromEntries([...el.querySelectorAll('[data-action]')].map(b => [b.dataset.action, b]));
  for (const [action, button] of Object.entries(buttons)) button.addEventListener('click', () => actions[action](p));
  const render = () => {
    title.textContent = p.task;
    meta.textContent = `${p.name} · ${p.source} · ${statusText(p)}`;
    meta.dataset.state = p.state;
    if (buttons.enter) buttons.enter.hidden = !(p.state === 'waiting' || p.state === 'entering');
    if (buttons.deorbit) buttons.deorbit.hidden = !(p.state === 'active' || p.state === 'leaving' || p.state === 'decaying');
    for (const b of Object.values(buttons)) b.disabled = !['waiting', 'active'].includes(p.state);
  };
  p.listeners.add(render);
  render();
  return { el, p, chapter };
});

const projected = new THREE.Vector3();
function place(time) {
  const w = innerWidth, h = innerHeight;
  for (const p of planets.values()) {
    const distance = camera.position.distanceTo(p.mesh.position);
    const visible = p.mesh.visible && distance < 15;
    const opacity = visible ? Math.min(1, (15 - distance) / 3) : 0;
    p.label.style.opacity = opacity;
    if (!opacity) continue;
    projected.copy(p.mesh.position).project(camera);
    if (projected.z > 1) { p.label.style.opacity = 0; continue; }
    const offset = p.size * 900 / distance / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (1000 / h) * 0.5 + 10;
    p.label.style.transform = `translate(${(projected.x * 0.5 + 0.5) * w + offset}px, ${(-projected.y * 0.5 + 0.5) * h - 16}px)`;
  }
  for (const { el, p, chapter } of cards) {
    const near = 1 - Math.min(1, Math.abs(progress - chapter - 0.35) / 0.55);
    const on = near > 0.05;
    el.style.opacity = Math.min(1, near * 2.2);
    el.inert = !on;
    if (!on || w < 760) { el.style.removeProperty('transform'); continue; }
    projected.copy(p.mesh.position).project(camera);
    const x = Math.min(w - el.offsetWidth - 24, Math.max(24, (projected.x * 0.5 + 0.5) * w + 70));
    const y = Math.min(h - el.offsetHeight - 24, Math.max(96, (-projected.y * 0.5 + 0.5) * h - el.offsetHeight / 2));
    el.style.transform = `translate(${x}px, ${y}px)`;
  }
}

let triggeredCore = false;
const view = { pos: HERO_DIR.clone().multiplyScalar(heroFit.distance), target: V(0, 0, 0), shift: heroFit.shift, shiftX: 0 };
let time = 0, last = performance.now(), running = false;
function frame(dt) {
  const { clientWidth: w, clientHeight: h } = canvas;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const s = measure();
  // Arriving at the core starts a fall, so the chapter shows what it says.
  if (s > 3.6 && s < 4.6 && !triggeredCore) {
    triggeredCore = true;
    const candidates = [...planets.values()].filter(p => p.state === 'active' && p.source === 'Redmine' && !featured.has(p.name));
    if (candidates.length) actions.complete(candidates[0]);
  }
  if (s < 3 || s > 5) triggeredCore = false;
  const goal = shot(s, time);
  const k = reduceMotion.matches ? 1 : 1 - Math.exp(-dt * 3.2);
  view.pos.lerp(goal.pos, k);
  view.target.lerp(goal.target, k);
  view.shift += (goal.shift - view.shift) * k;
  view.shiftX += (goal.shiftX - view.shiftX) * k;
  if (Math.abs(view.shift) > 0.5 || Math.abs(view.shiftX) > 0.5) camera.setViewOffset(w, h, view.shiftX, view.shift, w, h);
  else camera.clearViewOffset();
  camera.position.copy(view.pos);
  camera.lookAt(view.target);
  well.x += (well.tx - well.x) * Math.min(1, dt * 6);
  well.z += (well.tz - well.z) * Math.min(1, dt * 6);
  well.strength += ((reduceMotion.matches ? 0 : well.target) - well.strength) * Math.min(1, dt * 2.5);
  step(reduceMotion.matches ? 0 : dt, time);
  ambient(dt, s > 5.5 || s < 0.6);
  place(time);
  renderer.render(scene, camera);
}
function loop(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += reduceMotion.matches ? 0 : dt;
  frame(dt);
  requestAnimationFrame(loop);
}
function update() {
  const shouldRun = !document.hidden;
  if (shouldRun && !running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  if (!shouldRun) running = false;
}
document.addEventListener('visibilitychange', update);
document.documentElement.classList.add('sky-live');
frame(0);
update();
