// Desktop scene baseline copied from the approved planetary study on 2026-10-15.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCompletionSystem } from './completion.js';
import { createSystemTravel, travelStyles } from './travel.js';
import { createRenderLoop } from './render-loop.js';
import { createFramePacer } from './frame-pacer.js';
import { connectVisibility, isFullscreen, toggleFullscreen, reportRendering, desktop, onOpenSettings } from './platform.js';
import { createAppController } from './app-controller.js';
import { createAppUI, setupSettingsTabs } from './app-ui.js';
import { createTasksView } from './tasks-view.js';

const DEMO = import.meta.env.VITE_ORBIT_DEMO === 'true';
document.body.dataset.mode = DEMO ? 'demo' : 'live';
let controller;
let ui;
let tasksView;
const taskPlanets = new Map();
const busyTasks = new Set();

const $ = (id) => document.getElementById(id);
const canvas = $('space');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
} catch (error) {
  $('error').hidden = false;
  $('error').textContent = `Orbit needs WebGL 2. ${error.message}`;
  throw error;
}
renderer.setClearColor(0x0c1222);
renderer.setPixelRatio(1.5);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 200);
camera.position.set(0, 16, 25);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
controls.minDistance = 21; // Keeps the settings station inside the default framing.
controls.maxDistance = 48;
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI / 2.05;
controls.rotateSpeed = 0.55;
controls.target.set(0, 0, 0);
controls.update();
controls.saveState();
camera.layers.enable(1); // Layer 1 is the backdrop, which the completed-system glimpse leaves out.
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

// Seeded geometry keeps the scene identical between reloads and comparisons.
let seed = 19;
function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function rock(radius, color, detail = 1, rng = random) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position;
  const colors = [];
  for (let i = 0; i < position.count; i += 3) {
    const shade = new THREE.Color(color).multiplyScalar(0.72 + rng() * 0.4);
    for (let j = 0; j < 3; j++) colors.push(shade.r, shade.g, shade.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0.12 }));
}
function ring(radius, color, opacity = 0.6, dashed = false) {
  const points = Array.from({length: 241}, (_, i) => {
    const angle = i / 240 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.12, gapSize: 0.16 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  line.computeLineDistances();
  scene.add(line);
  return line;
}
// Soft additive annuli under each orbit line read as a glow without a bloom pass.
function glow(radius, color, width, opacity, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - width, radius + width, 200, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.rotation.x = -Math.PI / 2;
  parent.add(mesh);
  return mesh;
}
ring(4.2, 0x79bfff, 0.9);
glow(4.2, 0x79bfff, 0.05, 0.28); glow(4.2, 0x79bfff, 0.2, 0.06);
ring(7.1, 0x9de5f5, 0.8);
glow(7.1, 0x79bfff, 0.05, 0.22); glow(7.1, 0x79bfff, 0.22, 0.05);
ring(9.5, 0x64789b, 0.22, true);
const core = rock(1.45, 0x1e3554, 2);
core.rotation.z = 0.22;
scene.add(core);
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
// Accretion disc: seeded streaks on a radial falloff, spun slowly around the core.
const accretion = new THREE.Mesh(new THREE.RingGeometry(1.55, 3.3, 128, 1), new THREE.MeshBasicMaterial({
  map: canvasTexture(512, (g, s) => {
    const c = s / 2;
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
  }),
  transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
}));
// RingGeometry UVs are planar, so the square texture maps straight onto the disc.
accretion.rotation.x = -Math.PI / 2 + 0.12;
scene.add(accretion);
const radialSprite = (inner, outer) => canvasTexture(128, (g, s) => {
  const gradient = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gradient.addColorStop(0, inner); gradient.addColorStop(1, outer);
  g.fillStyle = gradient; g.fillRect(0, 0, s, s);
});
const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSprite('rgba(121,191,255,0.45)', 'rgba(121,191,255,0)'), depthWrite: false, blending: THREE.AdditiveBlending }));
coreGlow.scale.setScalar(6.5);
scene.add(coreGlow);
const planets = [];
const arrivals = new Map();
const tagLayer = document.createElement('div');
tagLayer.className = 'arrival-tags';
tagLayer.setAttribute('aria-hidden', 'true');
document.body.append(tagLayer);
const projected = new THREE.Vector3();

function fitArrivalTag(tag) {
  const label = tag.querySelector('.tag-name');
  label.style.width = 'max-content';
  const measuredWidth = label.getBoundingClientRect().width;
  const limit = Math.min(190, Math.max(24, innerWidth / 2 - 95));
  const width = Math.ceil(Math.min(limit, measuredWidth));
  label.style.removeProperty('width');
  tag.style.setProperty('--name-width', `${width}px`);
  tag.querySelector('.tag-brackets').setAttribute('d', `M 66 9 H 56 V 41 H 66 M ${width + 62} 9 H ${width + 72} V 41 H ${width + 62}`);
}

function beginFormation(planet) {
  const count = 72;
  const particles = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.055, 0),
    new THREE.MeshStandardMaterial({ color: 0x79bfff, roughness: 1, flatShading: true, transparent: true, opacity: 0, depthWrite: false }),
    count,
  );
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  const grains = Array.from({ length: count }, () => ({
    angle: random() * Math.PI * 2, radius: 0.8 + random() * 1.25,
    height: (random() - 0.5) * 0.65, size: 0.35 + random() * 1.1,
    delay: random() * 0.22,
  }));
  scene.add(particles);
  const tag = document.createElement('div');
  tag.className = 'arrival-tag';
  tag.style.opacity = '0';
  // Only fixed markup goes through innerHTML; task names are always plain text.
  tag.innerHTML = '<svg width="300" height="80" viewBox="0 0 300 80"><path class="tag-leader" d="M 0 70 L 38 25 L 55 25" pathLength="1"/><path class="tag-brackets"/></svg><span class="tag-name"></span>';
  const label = tag.querySelector('.tag-name');
  label.textContent = planet.userData.name;
  tagLayer.append(tag);
  fitArrivalTag(tag);
  planet.scale.setScalar(0.001);
  planet.userData.forming = true;
  arrivals.set(planet, { elapsed: 0, duration: 3.5, tagDuration: 3, particles, grains, tag });
}

function updateFormations(delta) {
  for (const [planet, arrival] of arrivals) {
    if (!paused) arrival.elapsed += delta * speed;
    const t = Math.min(arrival.elapsed / arrival.duration, 1);
    if (t === 1) {
      if (arrival.particles) {
        planet.scale.setScalar(1);
        scene.remove(arrival.particles);
        arrival.particles.geometry.dispose();
        arrival.particles.material.dispose();
        arrival.particles = null;
        planet.userData.forming = false;
        if (planet === selected) refreshSelection();
      }
      if (arrival.elapsed >= arrival.duration + arrival.tagDuration) {
        arrival.tag.remove();
        arrivals.delete(planet);
      }
      continue;
    }
    const growth = THREE.MathUtils.smoothstep(t, 0.12, 0.86);
    planet.scale.setScalar(Math.max(0.001, growth));
    arrival.particles.position.copy(planet.position);
    arrival.grains.forEach((grain, i) => {
      const capture = THREE.MathUtils.smoothstep(t, grain.delay, 0.82 + grain.delay * 0.6);
      const angle = grain.angle + arrival.elapsed * (0.65 + capture * 0.8);
      const radius = grain.radius * (1 - capture) + planet.userData.radius * growth * 0.65;
      dummy.position.set(Math.cos(angle) * radius, grain.height * (1 - capture), Math.sin(angle) * radius);
      dummy.rotation.set(angle, angle * 0.7, grain.angle);
      dummy.scale.setScalar(grain.size * Math.sin(Math.PI * Math.min(t / 0.15, 1) / 2) * (1 - capture));
      dummy.updateMatrix();
      arrival.particles.setMatrixAt(i, dummy.matrix);
    });
    arrival.particles.instanceMatrix.needsUpdate = true;
    const fadeIn = THREE.MathUtils.smoothstep(arrival.elapsed, 0, 0.6);
    arrival.particles.material.opacity = 0.8 * fadeIn * (1 - THREE.MathUtils.smoothstep(t, 0.75, 1));
  }
}

function updateArrivalTags() {
  for (const [planet, arrival] of arrivals) {
    const t = THREE.MathUtils.clamp((arrival.elapsed - arrival.duration) / arrival.tagDuration, 0, 1);
    projected.copy(planet.position).project(camera);
    const x = (projected.x * 0.5 + 0.5) * innerWidth;
    const y = (-projected.y * 0.5 + 0.5) * innerHeight;
    const left = x > innerWidth / 2;
    arrival.tag.classList.toggle('tag-left', left);
    arrival.tag.style.transform = `translate(${x - (left ? 300 : 0)}px, ${y - 70}px)`;
    arrival.tag.style.visibility = projected.z < -1 || projected.z > 1 ? 'hidden' : 'visible';
    // Fold the timeline so departure exactly reverses the opening choreography.
    // The middle holds the full name; opacity stays constant during retraction.
    const reveal = Math.min(t, 1 - t) * 2;
    arrival.tag.style.opacity = t > 0 && t < 1 ? '1' : '0';
    arrival.tag.style.setProperty('--line', 1 - THREE.MathUtils.smoothstep(reveal, 0.08, 0.3));
    arrival.tag.style.setProperty('--bracket', THREE.MathUtils.smoothstep(reveal, 0.25, 0.42));
    arrival.tag.style.setProperty('--reveal', `${100 * (1 - THREE.MathUtils.smoothstep(reveal, 0.34, 0.56))}%`);
  }
}
const labelLayer = document.createElement('div');
labelLayer.className = 'planet-labels';
labelLayer.setAttribute('aria-hidden', 'true');
canvas.after(labelLayer); // Below panels and menus in paint order.
function createPlanet({ name, orbit, radius, color, angle, speed, source, phase = angle, visualSeed = 19 }) {
  let localSeed = visualSeed;
  const rng = () => { localSeed = (Math.imul(localSeed, 1664525) + 1013904223) >>> 0; return localSeed / 4294967296; };
  const mesh = rock(radius, color, 1, rng);
  // Persistent label: name plus source/state line, positioned every frame.
  const label = document.createElement('div');
  label.className = 'planet-label';
  label.hidden = true;
  const leader = document.createElement('i');
  leader.className = 'leader';
  label.append(document.createElement('span'), document.createElement('small'), leader);
  label.firstChild.textContent = name;
  labelLayer.append(label);
  mesh.userData = {
    name, orbit, radius, angle, speed, source, label,
    spinAngle: angle, baseColor: new THREE.Color(color),
    status: speed ? 'in-progress' : 'not-started', transfer: null,
  };
  mesh.rotation.set(rng(), rng(), rng());
  mesh.position.set(Math.cos(phase) * orbit, Math.sin(phase * 2) * 0.08, Math.sin(phase) * orbit);
  planets.push(mesh);
  scene.add(mesh);
  return mesh;
}
const dustGeometry = new THREE.IcosahedronGeometry(0.08, 0);
const dustMesh = new THREE.InstancedMesh(dustGeometry, new THREE.MeshStandardMaterial({color: 0x354563, roughness: 1, flatShading: true}), 110);
const dummy = new THREE.Object3D();
for (let i = 0; i < 110; i++) {
  const angle = random() * Math.PI * 2;
  const radius = 8.1 + random() * 0.65;
  dummy.position.set(Math.cos(angle)*radius, (random()-0.5)*0.35, Math.sin(angle)*radius);
  dummy.rotation.set(random()*3, random()*3, random()*3);
  dummy.scale.setScalar(0.4+random()*1.7);
  dummy.updateMatrix();
  dustMesh.setMatrixAt(i, dummy.matrix);
}
scene.add(dustMesh);
const starPositions = [];
const starColors = [];
for (let i = 0; i < 1600; i++) {
  const theta = random() * Math.PI * 2;
  const y = random() * 2 - 1;
  const horizontal = Math.sqrt(1-y*y);
  const distance = 65 + random() * 35;
  starPositions.push(horizontal*Math.cos(theta)*distance, y*distance, horizontal*Math.sin(theta)*distance);
  const color = new THREE.Color().setHSL(0.55 + random()*0.07, 0.3, 0.3 + random()*0.5).multiplyScalar(0.95);
  starColors.push(color.r,color.g,color.b);
}
// The backdrop (stars, streaks, nebula) is drawn first and without depth, so either system paints
// over it wherever the camera travels. Its centre follows the view (see updateBackdrop).
const backdrop = (object, order) => { object.renderOrder = order; object.layers.set(1); object.frustumCulled = false; return object; };
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions,3));
starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors,3));
const stars = backdrop(new THREE.Points(starGeometry, new THREE.PointsMaterial({size: 0.12, vertexColors: true, depthTest: false, depthWrite: false})), -9);
scene.add(stars);
// Warp streaks: each star stretched back along the direction of travel, bright head to dark tail.
const streakPositions = new THREE.Float32BufferAttribute(new Float32Array(starPositions.length * 2), 3).setUsage(THREE.DynamicDrawUsage);
const streakColors = new Float32Array(starPositions.length * 2);
const streakLengths = Array.from({ length: starPositions.length / 3 }, (_, i) => 10 + 18 * (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1);
for (let i = 0; i < starPositions.length; i += 3) streakColors.set([starColors[i] * 1.6, starColors[i + 1] * 1.6, starColors[i + 2] * 1.6, 0, 0, 0], i * 2);
const streakGeometry = new THREE.BufferGeometry();
streakGeometry.setAttribute('position', streakPositions);
streakGeometry.setAttribute('color', new THREE.Float32BufferAttribute(streakColors, 3));
const streaks = backdrop(new THREE.LineSegments(streakGeometry, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false })), -8);
streaks.visible = false;
scene.add(streaks);
function updateStreaks(strength, direction) {
  streaks.visible = strength > 0.01;
  if (!streaks.visible) return;
  for (let i = 0; i < streakLengths.length; i++) {
    const x = starPositions[i * 3], y = starPositions[i * 3 + 1], z = starPositions[i * 3 + 2];
    const length = strength * streakLengths[i];
    streakPositions.setXYZ(i * 2, x, y, z);
    streakPositions.setXYZ(i * 2 + 1, x - direction.x * length, y - direction.y * length, z - direction.z * length);
  }
  streakPositions.needsUpdate = true;
}

// Depth layer (quality setting): far nebula sprites and dark rocks fixed near the camera.
const depthLayer = new THREE.Group();
const nebulaTexture = canvasTexture(256, (g, s) => {
  for (let i = 0; i < 14; i++) {
    const x = s * (0.2 + random() * 0.6), y = s * (0.3 + random() * 0.4), r = s * (0.12 + random() * 0.2);
    const gradient = g.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, random() < 0.4 ? 'rgba(157,229,245,0.16)' : 'rgba(72,152,217,0.2)');
    gradient.addColorStop(1, 'rgba(30,42,67,0)');
    g.fillStyle = gradient; g.fillRect(0, 0, s, s);
  }
});
for (const [x, y, z, size, turn] of [[-38, 14, -52, 70, 0.3], [30, 6, -58, 60, -0.5], [52, -4, 10, 54, 1.1], [-50, 2, 26, 48, 2]]) {
  const cloud = backdrop(new THREE.Sprite(new THREE.SpriteMaterial({ map: nebulaTexture, transparent: false, opacity: 0.85, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, rotation: turn })), -10);
  cloud.position.set(x, y, z); cloud.scale.set(size, size * 0.55, 1);
  depthLayer.add(cloud);
}
const foreground = new THREE.Group();
for (const [x, y, z, size] of [[-5.6, -3.9, -10, 1.5], [-3.9, -4.1, -9, 0.7], [5.8, -3.8, -10.5, 1.3], [4.1, -4.0, -8.5, 0.6]]) {
  const boulder = rock(size, 0x111a2c, 1);
  boulder.material.roughness = 1;
  boulder.material.transparent = true; boulder.material.opacity = 0.8;
  boulder.position.set(x, y, z);
  boulder.rotation.set(random() * 3, random() * 3, random() * 3);
  boulder.layers.set(1);
  foreground.add(boulder);
}
camera.add(foreground);
scene.add(camera, depthLayer);

// Settings live on a station parked outside the outer ring. It spins in place and never orbits.
const station = new THREE.Group();
const stationMaterial = new THREE.MeshStandardMaterial({ color: 0x79bfff, flatShading: true, roughness: 0.6, metalness: 0.3, emissive: 0x79bfff, emissiveIntensity: 0.05 });
const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x2c5f99, flatShading: true, roughness: 0.4, metalness: 0.5, emissive: 0x79bfff, emissiveIntensity: 0.03 });
const stationBody = new THREE.Group();
stationBody.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 6), stationMaterial));
const habitat = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.13, 5, 12), stationMaterial);
habitat.rotation.x = Math.PI / 2;
stationBody.add(habitat);
for (let i = 0; i < 3; i++) {
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.06), stationMaterial);
  spoke.rotation.y = i * Math.PI / 3;
  stationBody.add(spoke);
}
const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), stationMaterial);
mast.position.y = 0.2;
station.add(mast);
for (const side of [-1, 1]) {
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.42), panelMaterial);
  wing.position.set(0, 1.25 * side + 0.2, 0);
  wing.scale.set(1.6, 1, 1);
  station.add(wing);
}
station.add(stationBody);
station.position.set(12, 3.2, -7);
station.rotation.set(0.35, 0, -0.25);
station.scale.setScalar(0.85);
scene.add(station);
let stationHover = false;
let stationNeedsSetup = false;
const selectionRing = new THREE.Mesh(new THREE.RingGeometry(1.2,1.23,64),new THREE.MeshBasicMaterial({color:0xe0f4ff,side:THREE.DoubleSide,transparent:true,opacity:0.65,depthWrite:false}));
selectionRing.visible = false;
scene.add(selectionRing);

let paused = false;
let simulationTime = 0;
let selected = null;
let speed = 1;
let frameLimit = 60;
// Two systems share the scene: the active one at the origin and the completed one off to the side,
// out of the default framing. The switch at the bottom left flies the camera between them.
const systemCentres = { active: new THREE.Vector3(0, 0, 0), completed: new THREE.Vector3(70, -6, 10) };
const homeOffset = camera.position.clone().sub(controls.target);
let view = 'active';
const completionSystem = createCompletionSystem({ scene, rock, random, centre: systemCentres.completed, core: { glow: coreGlow, light: coreLight, disc: accretion }, onChange: planet => {
  if (planet === selected) refreshSelection();
} });
// The completed system's pale core: a calm glow where finished work comes back together.
const completedGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSprite('rgba(162,211,255,0.4)', 'rgba(162,211,255,0)'), depthWrite: false, blending: THREE.AdditiveBlending }));
completedGlow.scale.setScalar(5.5);
const completedLight = new THREE.PointLight(0xa2d3ff, 16, 16, 2);
completedLight.position.y = 1;
completionSystem.world.add(completedGlow, completedLight);
glow(4.2, 0x79bfff, 0.05, 0.2, completionSystem.world); glow(4.2, 0x79bfff, 0.2, 0.045, completionSystem.world);
glow(7.1, 0x79bfff, 0.05, 0.16, completionSystem.world); glow(7.1, 0x79bfff, 0.22, 0.04, completionSystem.world);
const homeOf = planet => planet.userData.status === 'completed' ? 'completed' : 'active';
const shownAt = new THREE.Vector3();
// Settled completed planets are drawn by their copy in the completed system while it is on screen.
const displayPosition = planet => (view === 'completed' && homeOf(planet) === 'completed' && completionSystem.positionOf(planet, shownAt)) || planet.position;

const veil = Object.assign(document.createElement('div'), { className: 'travel-veil', hidden: true });
const markers = Object.assign(document.createElement('div'), { className: 'travel-markers', hidden: true });
markers.setAttribute('aria-hidden', 'true');
for (const [system, text] of [['active', 'Active system'], ['completed', 'Completed system']]) {
  const marker = Object.assign(document.createElement('span'), { textContent: text });
  marker.dataset.view = system;
  markers.append(marker);
}
document.body.append(veil, markers);
const travel = createSystemTravel({ camera, veil, markers });
let travelStyle = 'glide';
$('transition').append(...travelStyles.map(([id, name]) => new Option(name, id)));
function showTravelStyle() {
  $('transition').value = travelStyle;
  $('transition-note').textContent = travelStyles.find(([id]) => id === travelStyle)[2];
}
$('transition').onchange = event => controller.savePreferences({ transition: event.target.value });
showTravelStyle();
function switchSystem(target, then) {
  if (target === view) { then?.(); return; }
  if (travel.active) return;
  select(null); closeSettings();
  hovered = null; stationHover = false; canvas.style.cursor = '';
  controls.enabled = false;
  completionSystem.setPreview(false);
  ui.pressSystem(target, true);
  const from = view;
  travel.start({
    style: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'dip' : travelStyle,
    from: systemCentres[from], to: systemCentres[target], fromView: from, toView: target,
    target: controls.target, centres: systemCentres,
    onCut() { view = target; ui.showSystem(target); updateEmptyScene(); },
    onDone() {
      controls.target.copy(systemCentres[target]);
      controls.target0.copy(systemCentres[target]);
      controls.position0.copy(systemCentres[target]).add(homeOffset);
      controls.enabled = true;
      completionSystem.setPreview(target === 'active');
      ui.pressSystem(target, false);
      then?.();
    },
  });
}
// Selecting a task from the cards travels to whichever system it lives in.
function focusTask(id) {
  const planet = taskPlanets.get(id);
  if (!planet) return;
  if (homeOf(planet) === view) select(planet);
  else switchSystem(homeOf(planet), () => select(planet));
}
let lastTasks = [];
function updateEmptyScene() {
  const completed = view === 'completed';
  $('empty-scene').textContent = completed ? 'Nothing completed yet' : 'No tasks in orbit yet';
  $('empty-scene').hidden = lastTasks.some(task => (task.state === 'completed') === completed);
}
function findOpenPhase(orbit) {
  const fullCircle = Math.PI * 2;
  const angles = planets
    .filter(planet => !planet.userData.completion && planet.userData.status !== 'completed' && (planet.userData.transfer?.targetOrbit ?? planet.userData.orbit) === orbit)
    .map(planet => (Math.atan2(planet.position.z, planet.position.x) + fullCircle) % fullCircle)
    .sort((a, b) => a - b);
  if (!angles.length) return random() * fullCircle;
  let widestGap = -1;
  let phase = 0;
  for (let i = 0; i < angles.length; i++) {
    const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + fullCircle;
    const gap = next - angles[i];
    if (gap > widestGap) {
      widestGap = gap;
      phase = angles[i] + gap / 2;
    }
  }
  return phase % fullCircle;
}
function select(planet) {
  selected = planet;
  $('selection').hidden = !planet;
  selectionRing.visible = !!planet;
  ui?.selected();
  if (planet) {
    refreshSelection();
    closeSettings();
  }
}
function refreshSelection() {
  if (!selected) return;
  const { name, source, status, transfer, forming, completion } = selected.userData;
  const isWaiting = status === 'not-started';
  const isLeaving = transfer?.kind === 'out';
  const destination = source === 'Redmine' ? 'inner' : 'outer';
  $('planet-name').textContent = name;
  $('planet-source').textContent = source;
  const saving = busyTasks.has(selected.userData.task?.id);
  $('ticket-details').textContent = DEMO ? '' : '#' + selected.userData.task.externalId
    + (selected.userData.task.project ? '\n' + selected.userData.task.project : '')
    + (selected.userData.task.priority ? ' · ' + selected.userData.task.priority : '');
  $('open-source').hidden = DEMO || !selected.userData.task.url;
  $('complete-planet').disabled = saving || !!forming || !!transfer || !!completion || status === 'completed';
  $('complete-planet').textContent = completion ? 'Completing…' : status === 'completed' ? 'Completed ✓' : 'Complete ✓';
  $('enter-orbit').hidden = !!completion || status === 'completed';
  if (completion || status === 'completed') {
    $('planet-status').textContent = completion ? 'Completing' : 'Completed';
    $('planet-description').textContent = `${completion ? 'Travelling to' : 'Settled in'} the completed system`;
    const stageLabel = { approaching: 'Captured by the black hole', circling: 'Spiralling in', breaking: 'Crumbling under tidal forces', absorbing: 'Crossing the event horizon', emerging: 'Reassembling in the completed system' };
    $('orbit-hint').textContent = completion ? `${stageLabel[completion.stage] ?? 'Captured by the black hole'}${paused ? ' · motion paused' : '…'}` : `Reassembled in the ${destination} ${source} orbit.`;
    return;
  }
  $('planet-status').textContent = forming ? 'Forming' : transfer ? isLeaving ? 'De-orbiting' : 'Entering orbit' : isWaiting ? 'Not started' : 'In progress';
  $('planet-status').classList.toggle('active', !isWaiting);
  $('planet-description').textContent = isLeaving ? 'Returning to the waiting ring' : isWaiting ? 'Awaiting orbital insertion' : `${destination[0].toUpperCase() + destination.slice(1)} orbit`;
  $('enter-orbit').disabled = saving || !!transfer || !!forming;
  $('enter-orbit').textContent = forming ? 'Forming…' : transfer ? isLeaving ? 'De-orbiting…' : 'Entering…' : isWaiting ? 'Enter orbit ↗' : 'De-orbit ↗';
  $('orbit-hint').textContent = forming
    ? `Dust is gathering into a new world${paused ? ' · motion paused' : '…'}`
    : transfer
    ? `${isLeaving ? 'Slowing into the outer waiting ring' : `Moving into the ${source} orbit`}${paused ? ' · motion paused' : '…'}`
    : isWaiting
      ? `Start this task and join the ${destination} orbit.`
      : 'Return this task to not started and coast into the outer waiting ring.';
}
function transferPlanet(selected, targetStatus) {
  if (!selected || selected.userData.transfer || selected.userData.forming || selected.userData.completion || selected.userData.status === 'completed') return;
  const data = selected.userData;
  const leaving = targetStatus === 'not-started';
  const targetOrbit = leaving ? 9.5 : data.source === 'Redmine' ? 4.2 : 7.1;
  const orbitalSpeed = leaving ? 0 : data.source === 'Redmine' ? 0.048 : 0.03;
  const targetColor = new THREE.Color(leaving ? 0x64789b : data.activeColor);
  const fromPhase = data.angle + simulationTime * data.speed;
  const fromSpeed = data.speed;
  data.speed = orbitalSpeed;
  data.status = 'in-progress';
  data.transfer = {
    fromOrbit: data.orbit, targetOrbit, fromPhase, fromSpeed,
    kind: leaving ? 'out' : 'in', targetStatus: leaving ? 'not-started' : 'in-progress',
    sweep: Math.PI / 2.5, elapsed: 0, duration: 6,
    fromTint: selected.material.color.clone(),
    targetTint: new THREE.Color().setRGB(
      targetColor.r / data.baseColor.r,
      targetColor.g / data.baseColor.g,
      targetColor.b / data.baseColor.b,
    ),
  };
  refreshSelection();
}
$('enter-orbit').onclick = () => {
  if (!selected || busyTasks.has(selected.userData.task.id)) return;
  controller.setState(selected.userData.task.id, selected.userData.task.state === 'in-progress' ? 'not-started' : 'in-progress');
};
$('complete-planet').onclick = () => { if (selected) controller.setState(selected.userData.task.id, 'completed'); };
$('open-source').onclick = () => { if (selected) controller.openSource(selected.userData.task.id); };
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;
let hovered = null;
let showLabels = true; // Off: labels appear only on hover or selection.
const pickable = () => view === 'completed'
  ? completionSystem.settledMeshes()
  : planets.filter(planet => planet.visible && !planet.userData.completion && planet.userData.status !== 'completed');
// Completed copies stand in for their planet.
const pick = () => { const object = raycaster.intersectObjects(pickable())[0]?.object; return object?.userData.owner ?? object ?? null; };
const pickStation = () => view === 'active' && raycaster.intersectObject(station, true).length > 0;
// Hover reveals a label for waiting planets, or for any planet while labels are off.
canvas.addEventListener('pointermove', e => {
  if (e.buttons || travel.active) return;
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);
  raycaster.setFromCamera(pointer,camera);
  hovered = pick();
  stationHover = !hovered && pickStation();
  canvas.style.cursor = hovered || stationHover ? 'pointer' : '';
});
canvas.addEventListener('pointerleave', () => { hovered = null; stationHover = false; });
canvas.addEventListener('pointerdown', e => { down = {x:e.clientX, y:e.clientY}; });
canvas.addEventListener('pointerup', e => {
  if (!down || travel.active || Math.hypot(e.clientX-down.x,e.clientY-down.y)>5) return;
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);
  raycaster.setFromCamera(pointer,camera);
  const planet = pick();
  if (!planet && pickStation()) { select(null); openSettings(); }
  else { closeSettings(); select(planet); }
  down = null;
});
$('clear').onclick = () => select(null);
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// Panels are translucent, so labels must not slide underneath them. Re-read a few times a second.
let panelRects = [];
let placedLabels = [];
let panelRectsAt = -Infinity;
function readPanelRects() {
  panelRects = [...document.querySelectorAll('header > *, .intro, .sources, .system-switch, .scene-controls, #selection:not([hidden]), #settings:not([hidden]), #completed-preview:not([hidden])')]
    .map(el => { const r = el.getBoundingClientRect(); return { x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 }; });
  panelRectsAt = performance.now();
}
function updateLabels() {
  if (performance.now() - panelRectsAt > 250) readPanelRects();
  camera.updateMatrixWorld(); // Projection must not depend on a frame having rendered (e.g. toggled while hidden).
  const pixelsPerUnit = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * camera.zoom;
  const candidates = [];
  for (const planet of planets) {
    const data = planet.userData;
    const focus = planet === selected || planet === hovered;
    const waiting = data.status === 'not-started' || data.transfer?.kind === 'out';
    const hidden = travel.active || homeOf(planet) !== view || data.completion || data.forming || arrivals.has(planet);
    if (hidden || (!showLabels && !focus)) { data.label.hidden = true; continue; }
    const position = displayPosition(planet);
    const distance = camera.position.distanceTo(position);
    projected.copy(position).project(camera);
    if (projected.z > 1) { data.label.hidden = true; continue; }
    // Waiting exoplanets sit further out on a dashed leader, as in the concept.
    candidates.push({ planet, focus, waiting, x: (projected.x * 0.5 + 0.5) * innerWidth, y: (-projected.y * 0.5 + 0.5) * innerHeight, offset: data.radius * pixelsPerUnit / distance + (waiting ? 36 : 8), lead: waiting ? 30 : 0 });
  }
  // Greedy placement: focused planets first; labels that would overlap another are dropped.
  candidates.sort((a, b) => b.focus - a.focus);
  const placed = placedLabels = [];
  for (const { planet, focus, waiting, x, y, offset, lead } of candidates) {
    const data = planet.userData;
    const meta = waiting ? 'Not started' : data.source;
    if (data.label.children[1].textContent !== meta) data.label.children[1].textContent = meta;
    data.label.dataset.source = data.source.toLowerCase();
    data.label.classList.toggle('focus', focus);
    data.label.classList.toggle('waiting', waiting);
    data.label.lastChild.style.cssText = lead ? `left:${-lead - 4}px;width:${lead}px` : 'display:none';
    data.label.hidden = false;
    // Measure only when the text changes; reading layout every frame is wasteful.
    if (data.labelKey !== meta) { data.labelKey = meta; data.labelWidth = data.label.offsetWidth; }
    const rect = { x: x + offset, y: y - 15, w: data.labelWidth, h: 32 };
    if (panelRects.some(r => overlaps(rect, r)) || (!focus && placed.some(r => overlaps(rect, r)))) { data.label.hidden = true; continue; }
    placed.push(rect);
    data.label.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
  }
}
$('labels-toggle').onclick = () => controller.savePreferences({ labels: !showLabels });
$('pause').onclick = () => controller.savePreferences({ paused: !paused });
$('reset').onclick = () => { if (!travel.active) { controls.reset(); select(null); } };
function zoom(factor) {
  if (travel.active) return;
  const offset = camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(offset);
}
$('zoom-in').onclick = () => zoom(0.85);
$('zoom-out').onclick = () => zoom(1.18);
// Frame-rate readout is a local debugging aid, not a synced preference.
let debug = false;
try { debug = localStorage.getItem('orbit:debug') === '1'; } catch {}
function setDebug(value) {
  debug = value;
  $('debug').checked = value; $('fps').hidden = !value; $('stats').hidden = !value;
  try { localStorage.setItem('orbit:debug', value ? '1' : '0'); } catch {}
}
$('debug').onchange = e => setDebug(e.target.checked);
setDebug(debug);
$('depth').onchange = e => controller.savePreferences({ depth: e.target.checked });

// Station settings card: anchored beside the station, closed by Esc or an outside click.
const settingsCard = $('settings');
const tabs = setupSettingsTabs();
function openSettings() {
  if (!settingsCard.hidden) return;
  select(null);
  tabs.showFirst();
  settingsCard.hidden = false;
  positionSettings();
  settingsCard.querySelector('[role=tab][aria-selected=true]')?.focus();
}
function closeSettings() {
  if (settingsCard.hidden) return;
  settingsCard.hidden = true;
}
function positionSettings() {
  if (settingsCard.hidden) return;
  station.getWorldPosition(projected).project(camera);
  const x = (projected.x * 0.5 + 0.5) * innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * innerHeight;
  const w = settingsCard.offsetWidth, h = settingsCard.offsetHeight;
  const left = x + 40 + w < innerWidth - 16 ? x + 40 : x - 40 - w;
  settingsCard.style.transform = `translate(${THREE.MathUtils.clamp(left, 16, innerWidth - w - 16)}px, ${THREE.MathUtils.clamp(y - 60, 16, innerHeight - h - 16)}px)`;
}
$('close-settings').onclick = closeSettings;
addEventListener('keydown', event => {
  if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (!settingsCard.hidden) closeSettings();
  else if (selected) select(null);
});
document.addEventListener('pointerdown', event => {
  // Canvas clicks are resolved on pointerup so a click on the station toggles cleanly.
  if (!settingsCard.hidden && !event.target.closest('#settings, dialog, #space')) closeSettings();
});
onOpenSettings(openSettings).catch(console.error);

// Ring labels follow the near side of each orbit as the view turns.
const ringLayer = document.createElement('div');
ringLayer.className = 'ring-labels';
ringLayer.setAttribute('aria-hidden', 'true');
labelLayer.after(ringLayer);
const ringLabels = [[4.2, '01', 'Redmine', 0.55], [7.1, '02', 'ClickUp', 0.32]].map(([radius, number, name, lean]) => {
  const el = document.createElement('div');
  el.className = 'ring-label';
  el.hidden = true; // Shown once the first frame projects it.
  el.append(Object.assign(document.createElement('b'), { textContent: number }), name);
  ringLayer.append(el);
  return { el, radius, lean };
});
const ringPoint = new THREE.Vector3();
function updateOverlays(now) {
  const centre = systemCentres[view];
  const facing = Math.atan2(camera.position.z - centre.z, camera.position.x - centre.x);
  for (const { el, radius, lean } of ringLabels) {
    ringPoint.set(centre.x + Math.cos(facing + lean) * radius, centre.y, centre.z + Math.sin(facing + lean) * radius).project(camera);
    // Task titles win: a ring label steps aside when it would cover one.
    const rect = { x: (ringPoint.x * 0.5 + 0.5) * innerWidth, y: (-ringPoint.y * 0.5 + 0.5) * innerHeight + 6, w: 96, h: 18 };
    el.hidden = travel.active || placedLabels.some(r => overlaps(rect, r)) || panelRects.some(r => overlaps(rect, r));
    el.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
  }
  // Station: hover brightens it; an unconfigured Redmine connection makes it pulse softly.
  const pulse = stationNeedsSetup ? 0.5 + 0.5 * Math.sin(now / 1000 * 2.4) : 0;
  stationMaterial.emissiveIntensity = stationHover || !settingsCard.hidden ? 0.55 : 0.05 + pulse * 0.35;
  station.getWorldPosition(projected).project(camera);
  const label = $('station-label');
  label.classList.toggle('visible', stationHover && settingsCard.hidden);
  label.style.transform = `translate(${(projected.x * 0.5 + 0.5) * innerWidth - 30}px, ${(-projected.y * 0.5 + 0.5) * innerHeight - 70}px)`;
  positionSettings();
  positionCallout();
}
const calloutPoint = new THREE.Vector3();
function positionCallout() {
  if (!selected) return;
  const card = $('selection');
  calloutPoint.copy(displayPosition(selected)).project(camera);
  const x = (calloutPoint.x * 0.5 + 0.5) * innerWidth;
  const y = (-calloutPoint.y * 0.5 + 0.5) * innerHeight;
  const w = card.offsetWidth, h = card.offsetHeight;
  const gap = 34;
  const left = x + gap + w < innerWidth - 16 && x < innerWidth * 0.62 ? x + gap : x - gap - w;
  card.style.transform = `translate(${THREE.MathUtils.clamp(left, 16, innerWidth - w - 16)}px, ${THREE.MathUtils.clamp(y - h - 12, 70, innerHeight - h - 76)}px)`;
}
$('speed').oninput = e => { speed = Number(e.target.value); $('speed-value').textContent = speed.toFixed(1) + '×'; };
$('speed').onchange = e => controller.savePreferences({ speed: Number(e.target.value) });
$('frame-limit').onchange = e => controller.savePreferences({ frameLimit: Number(e.target.value) });
$('resolution').onchange = e => controller.savePreferences({ resolution: Number(e.target.value) });
$('stars').onchange = e => controller.savePreferences({ stars: e.target.checked });
$('fullscreen').onclick = async () => {
  try {
    await toggleFullscreen();
    await updateFullscreenLabel();
  } catch (error) { console.error('Could not toggle fullscreen', error); }
};
async function updateFullscreenLabel() {
  $('fullscreen').textContent = await isFullscreen() ? 'Exit fullscreen ↙' : 'Fullscreen ↗';
}
document.addEventListener('fullscreenchange', updateFullscreenLabel);
addEventListener('resize', updateFullscreenLabel);
updateFullscreenLabel().catch(console.error);
function resize() {
  for (const { tag } of arrivals.values()) fitArrivalTag(tag);
  camera.aspect = innerWidth/innerHeight;
  camera.zoom = Math.min(1, camera.aspect / 1.1);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}
addEventListener('resize',resize);
resize();
function updateScene(delta) {
  if (!paused) simulationTime += delta*speed;
  core.rotation.y = simulationTime*0.035;
  accretion.rotation.z = -simulationTime*0.06;
  stationBody.rotation.y = simulationTime*0.25;
  foreground.rotation.z = Math.sin(simulationTime*0.05)*0.01;
  dustMesh.rotation.y = simulationTime*0.009;
  for (const planet of planets) {
    const data = planet.userData;
    if (data.completion || data.status === 'completed') continue;
    let phase = data.angle + simulationTime * data.speed;
    if (data.transfer) {
      const transfer = data.transfer;
      if (!paused) transfer.elapsed += delta * speed;
      const progress = Math.min(transfer.elapsed / transfer.duration, 1);
      // Curved transfers meet either ring tangentially, with zero radial velocity at the ends.
      const eased = progress ** 3 * (10 - 15 * progress + 6 * progress ** 2);
      const angularEase = progress * progress * (3 - 2 * progress);
      const departureTangent = progress ** 3 - 2 * progress ** 2 + progress;
      const arrivalTangent = progress ** 3 - progress ** 2;
      phase = transfer.fromPhase + transfer.sweep * angularEase
        + transfer.duration * transfer.fromSpeed * departureTangent
        + transfer.duration * data.speed * arrivalTangent;
      data.orbit = THREE.MathUtils.lerp(transfer.fromOrbit, transfer.targetOrbit, eased);
      planet.material.color.lerpColors(transfer.fromTint, transfer.targetTint, eased);
      if (progress === 1) {
        // Preserve position and angular speed when ordinary orbiting takes over.
        data.angle = phase - simulationTime * data.speed;
        data.status = transfer.targetStatus;
        data.transfer = null;
        if (planet === selected) refreshSelection();
      }
    }
    const { orbit } = data;
    planet.position.set(Math.cos(phase)*orbit,Math.sin(phase*2)*0.08,Math.sin(phase)*orbit);
    // Waiting exoplanets stay still; only worlds in motion spin.
    if (data.status !== 'not-started' || data.transfer) planet.rotation.y = data.spinAngle + simulationTime*0.09;
  }
  // A planet that leaves the completed system (reopened upstream) takes its selection with it.
  if (selected && view === 'completed' && !travel.active && homeOf(selected) !== 'completed') select(null);
  if (selected) {
    selectionRing.visible = homeOf(selected) === view && (view === 'completed' || selected.visible);
    selectionRing.position.copy(displayPosition(selected));
    selectionRing.quaternion.copy(camera.quaternion);
    selectionRing.scale.setScalar(selected.userData.radius * selected.scale.x);
  }
}
// The backdrop centres on whatever the camera orbits, so both systems get the same sky.
function updateBackdrop() {
  const { sky, streak, direction, energy } = travel.out;
  const anchor = travel.active ? sky : controls.target;
  stars.position.copy(anchor); streaks.position.copy(anchor); depthLayer.position.copy(anchor);
  updateStreaks(streak, direction);
  completionSystem.setTravelEnergy(1.5 * energy.active);
  completedGlow.scale.setScalar(5.5 * (1 + 0.8 * energy.completed));
  completedGlow.material.color.setScalar(1 + energy.completed);
  completedLight.intensity = 16 * (1 + 1.5 * energy.completed);
}
const framePacer = createFramePacer(performance.now());
let statsStart = performance.now();
let frames = 0;
let totalFrames = 0;
function animate(now) {
  const delta = framePacer.advance(now, frameLimit);
  if (delta === null) return;
  updateScene(delta);
  updateFormations(delta);
  if (!travel.update(delta)) controls.update();
  updateBackdrop();
  completionSystem.update(delta, paused, speed);
  updateArrivalTags();
  updateLabels();
  updateOverlays(now);
  renderer.render(scene,camera);
  completionSystem.render(renderer.getPixelRatio());
  frames++;
  totalFrames++;
  if (now-statsStart >= 1000) {
    $('fps').textContent = `${Math.round(frames*1000/(now-statsStart))} fps`;
    $('stats').textContent = `${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles.toLocaleString()} triangles`;
    frames = 0;
    statsStart = now;
  }
}
updateScene(0);
const renderLoop = createRenderLoop({
  render: animate,
  reset(now) {
    framePacer.reset(now);
    statsStart = now;
    frames = 0;
  },
  requestFrame: callback => requestAnimationFrame(callback),
  cancelFrame: id => cancelAnimationFrame(id),
  now: () => performance.now(),
});
function reportSample() {
  reportRendering({ frames: totalFrames, seconds: performance.now() / 1000,
    documentVisible: !document.hidden, frameLimit, resolution: renderer.getPixelRatio() });
}

function clearArrival(planet) {
  const arrival = arrivals.get(planet);
  if (arrival) {
    arrival.tag.remove();
    if (arrival.particles) {
      scene.remove(arrival.particles);
      arrival.particles.geometry.dispose();
      arrival.particles.material.dispose();
    }
    arrivals.delete(planet);
  }
  planet.scale.setScalar(1);
  planet.userData.forming = false;
}
function posePlanet(planet, state) {
  const data = planet.userData;
  const active = state === 'in-progress';
  const phase = Math.atan2(planet.position.z, planet.position.x);
  data.orbit = active ? data.source === 'Redmine' ? 4.2 : 7.1 : 9.5;
  data.speed = active ? data.source === 'Redmine' ? 0.048 : 0.03 : 0;
  data.angle = phase - simulationTime * data.speed;
  data.status = state;
  const color = new THREE.Color(active ? data.activeColor : 0x64789b);
  planet.material.color.setRGB(color.r / data.baseColor.r, color.g / data.baseColor.g, color.b / data.baseColor.b);
  planet.position.set(Math.cos(phase) * data.orbit, Math.sin(phase * 2) * 0.08, Math.sin(phase) * data.orbit);
}
function settlePlanet(planet) {
  clearArrival(planet);
  planet.userData.transfer = null;
  const task = planet.userData.task;
  if (task.state === 'completed') {
    if (planet.userData.status !== 'completed' || planet.userData.completion) {
      posePlanet(planet, task.completedFrom ?? 'in-progress');
      completionSystem.restore(planet);
    }
  } else {
    completionSystem.remove(planet);
    planet.visible = true;
    posePlanet(planet, task.state);
  }
}
function settleAll() {
  travel.finish();
  for (const planet of taskPlanets.values()) settlePlanet(planet);
  completionSystem.settleAll();
  selectionRing.visible = false;
  refreshSelection();
}
function spawnTask(task, animate) {
  const source = task.source ?? 'Redmine';
  const initialState = task.state === 'completed' ? task.completedFrom ?? 'in-progress' : task.state;
  const active = initialState === 'in-progress';
  const orbit = active ? source === 'Redmine' ? 4.2 : 7.1 : 9.5;
  const phase = task.appearance?.angle ?? findOpenPhase(orbit);
  const activeColor = task.appearance?.speed ? task.appearance.color : source === 'Redmine' ? 0x79bfff : 0xa2d3ff;
  const planet = createPlanet({
    name: task.title, source, orbit, phase, visualSeed: task.seed,
    radius: task.appearance?.radius ?? 0.38 + (task.seed % 1000) / 1000 * 0.2,
    color: task.appearance?.color ?? (active ? activeColor : 0x64789b),
    angle: phase - simulationTime * (active ? source === 'Redmine' ? 0.048 : 0.03 : 0),
    speed: active ? task.appearance?.speed || (source === 'Redmine' ? 0.048 : 0.03) : 0,
  });
  planet.userData.task = task;
  planet.userData.targetState = task.state;
  planet.userData.activeColor = activeColor;
  taskPlanets.set(task.id, planet);
  if (task.state === 'completed') completionSystem.restore(planet);
  else if (animate) beginFormation(planet);
  return planet;
}
function applySnapshot(snapshot, { settle, animate }) {
  // Hidden tasks have no planet; revealing one forms it again like a new arrival.
  const sceneTasks = snapshot.tasks.filter(task => !task.hidden);
  const ids = new Set(sceneTasks.map(task => task.id));
  for (const [id, planet] of taskPlanets) {
    if (ids.has(id)) continue;
    if (selected === planet) select(null);
    if (hovered === planet) hovered = null;
    clearArrival(planet); completionSystem.remove(planet); scene.remove(planet);
    planet.userData.label.remove(); planet.geometry.dispose(); planet.material.dispose();
    planets.splice(planets.indexOf(planet), 1); taskPlanets.delete(id);
  }
  for (const task of sceneTasks) {
    let planet = taskPlanets.get(task.id);
    if (!planet) { spawnTask(task, animate && !settle); continue; }
    const data = planet.userData;
    const previousTarget = data.targetState;
    data.task = task; data.name = task.title;
    data.label.firstChild.textContent = task.title;
    data.targetState = task.state;
    const tag = arrivals.get(planet)?.tag;
    if (tag) { tag.querySelector('.tag-name').textContent = task.title; fitArrivalTag(tag); }
    if (settle) { settlePlanet(planet); continue; }
    if (previousTarget === task.state) continue;
    if (!animate) { settlePlanet(planet); continue; }
    clearArrival(planet);
    if (data.transfer) { data.transfer = null; posePlanet(planet, previousTarget); }
    if (task.state === 'completed') {
      completionSystem.complete([planet]);
    } else if (previousTarget === 'completed') {
      completionSystem.remove(planet); planet.visible = true; posePlanet(planet, task.state); beginFormation(planet);
    } else {
      transferPlanet(planet, task.state);
    }
  }
  const preferences = snapshot.preferences;
  paused = preferences.paused; speed = preferences.speed; frameLimit = preferences.frameLimit; showLabels = preferences.labels;
  travelStyle = travelStyles.some(([id]) => id === preferences.transition) ? preferences.transition : 'glide';
  showTravelStyle();
  stars.visible = preferences.stars;
  const depth = preferences.depth ?? true;
  depthLayer.visible = depth; foreground.visible = depth; $('depth').checked = depth;
  // Pulse the station until at least one source is connected.
  stationNeedsSetup = !DEMO && !Object.values(snapshot.sources ?? {}).some(info => info.connection?.connected);
  lastTasks = sceneTasks;
  updateEmptyScene();
  if (renderer.getPixelRatio() !== preferences.resolution) { renderer.setPixelRatio(preferences.resolution); resize(); }
  $('labels-toggle').setAttribute('aria-pressed', String(showLabels));
  $('pause').textContent = paused ? 'Resume motion' : 'Pause motion';
  $('speed').value = speed; $('speed-value').textContent = speed.toFixed(1) + '×';
  $('frame-limit').value = frameLimit; $('resolution').value = preferences.resolution; $('stars').checked = preferences.stars;
  ui.render(snapshot); tasksView.render(snapshot); refreshSelection(); updateLabels();
}
tasksView = createTasksView({ controller: () => controller, focusTask });
ui = createAppUI({ controller: () => controller, selectTask: focusTask, selectedId: () => selected?.userData.task.id, switchSystem, openTasks: source => tasksView.open(source) });
for (const input of document.querySelectorAll('#motion-panel input, #motion-panel select, #pause, #labels-toggle')) input.disabled = true;
async function boot() {
  let repository;
  if (DEMO) {
    if (desktop) {
      const { invoke } = await import('@tauri-apps/api/core');
      if (await invoke('get_app_mode') !== 'demo') throw new Error('Frontend and native build modes do not match. Rebuild Orbit.');
    }
    const demo = await import('./demo.js');
    repository = demo.createDemoRepository();
    controller = createAppController({ repository, view: {
      applySnapshot, settle: settleAll, setVisible: visible => renderLoop.setVisible('application', visible),
      error: message => ui.error(message), busy: (id, value) => { ui.busy(id, value); value ? busyTasks.add(id) : busyTasks.delete(id); refreshSelection(); },
    } });
    demo.setupDemoTools({ repository, controller, selectTask: focusTask });
  } else {
    const { createNativeRepository } = await import('./native-repository.js');
    repository = await createNativeRepository();
    controller = createAppController({ repository, view: {
      applySnapshot, settle: settleAll, setVisible: visible => renderLoop.setVisible('application', visible),
      error: message => ui.error(message), busy: (id, value) => { ui.busy(id, value); value ? busyTasks.add(id) : busyTasks.delete(id); refreshSelection(); },
    } });
  }
  await controller.start();
  await controller.setVisibility('document', !document.hidden);
  document.addEventListener('visibilitychange', () => { controller.setVisibility('document', !document.hidden); reportSample(); });
  await connectVisibility(visible => { controller.setVisibility('native', visible); reportSample(); });
  ui.busy('preferences', false);
}
renderLoop.setVisible('application', false);
boot().catch(error => ui.error(String(error.message ?? error)));
setInterval(reportSample, 5000);
