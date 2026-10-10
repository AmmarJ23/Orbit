// Throwaway animation study: can Orbit's gentle low-poly motion feel good on a second screen?
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCompletionSystem } from './completion.js';

const $ = (id) => document.getElementById(id);
const canvas = $('space');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
} catch (error) {
  $('error').hidden = false;
  $('error').textContent = `This prototype needs WebGL 2. ${error.message}`;
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
controls.minDistance = 17;
controls.maxDistance = 48;
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI / 2.05;
controls.rotateSpeed = 0.55;
controls.target.set(0, 0, 0);
controls.update();
controls.saveState();
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
function rock(radius, color, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position;
  const colors = [];
  for (let i = 0; i < position.count; i += 3) {
    const shade = new THREE.Color(color).multiplyScalar(0.72 + random() * 0.4);
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
ring(4.2, 0x79bfff, 0.8);
ring(7.1, 0x9de5f5, 0.7);
ring(9.5, 0x64789b, 0.22, true);
const core = rock(1.45, 0x1e3554, 2);
core.rotation.z = 0.22;
scene.add(core);
// Thin translucent annuli give the centre a halo without fullscreen bloom passes.
for (let i = 0; i < 4; i++) {
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.7 + i * 0.17, 1.75 + i * 0.17, 100), new THREE.MeshBasicMaterial({color: 0x79bfff, transparent: true, opacity: 0.23 - i * 0.04, side: THREE.DoubleSide, depthWrite: false}));
  halo.rotation.x = -Math.PI / 2;
  scene.add(halo);
}
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
const specs = [
  ['Lyra', 4.2, 0.62, 0x79bfff, 2.3, 0.052, 'Redmine · inner orbit'],
  ['Vega', 4.2, 0.43, 0x4898d9, 5.4, 0.045, 'Redmine · inner orbit'],
  ['Elara', 4.2, 0.29, 0xb6e1ff, 0.3, 0.058, 'Redmine · inner orbit'],
  ['Mira', 7.1, 0.76, 0x8ad8ed, 3.7, 0.029, 'ClickUp · outer orbit'],
  ['Atlas', 7.1, 0.58, 0x559bcf, 0.6, 0.034, 'ClickUp · outer orbit'],
  ['Nova', 7.1, 0.42, 0xa2d3ff, 5.2, 0.025, 'ClickUp · outer orbit'],
  ['Cinder', 9.5, 0.65, 0x64789b, 2.4, 0, 'Not started · stationary'],
  ['Echo', 9.5, 0.38, 0x465d7a, 0.1, 0, 'Not started · stationary'],
  ['Solace', 9.5, 0.53, 0x8095ac, 4.8, 0, 'Not started · stationary'],
];
function createPlanet({ name, orbit, radius, color, angle, speed, source, phase = angle }) {
  const mesh = rock(radius, color);
  mesh.userData = {
    name, orbit, radius, angle, speed, source,
    spinAngle: angle, baseColor: new THREE.Color(color),
    status: speed ? 'in-progress' : 'not-started', transfer: null,
  };
  mesh.rotation.set(random(), random(), random());
  mesh.position.set(Math.cos(phase) * orbit, Math.sin(phase * 2) * 0.08, Math.sin(phase) * orbit);
  planets.push(mesh);
  scene.add(mesh);
  return mesh;
}
for (const [name, orbit, radius, color, angle, speed] of specs) {
  const source = orbit === 4.2 || name === 'Cinder' ? 'Redmine' : 'ClickUp';
  createPlanet({ name, orbit, radius, color, angle, speed, source });
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
  const color = new THREE.Color().setHSL(0.55 + random()*0.07, 0.3, 0.3 + random()*0.5);
  starColors.push(color.r,color.g,color.b);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions,3));
starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors,3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({size: 0.12, vertexColors: true, transparent: true, opacity: 0.95}));
scene.add(stars);
const selectionRing = new THREE.Mesh(new THREE.RingGeometry(1.2,1.23,64),new THREE.MeshBasicMaterial({color:0xe0f4ff,side:THREE.DoubleSide,transparent:true,opacity:0.65,depthWrite:false}));
selectionRing.visible = false;
scene.add(selectionRing);

let paused = false;
let simulationTime = 0;
let selected = null;
let speed = 1;
let frameLimit = 60;
const completionSystem = createCompletionSystem({ scene, rock, random, onChange: planet => {
  if (planet === selected) refreshSelection();
} });
function showTestingTab(name) {
  for (const tabName of ['planets', 'motion']) {
    const active = tabName === name;
    $(`${tabName}-tab`).setAttribute('aria-selected', String(active));
    $(`${tabName}-tab`).tabIndex = active ? 0 : -1;
    $(`${tabName}-panel`).hidden = !active;
  }
}
for (const name of ['planets', 'motion']) {
  $(`${name}-tab`).onclick = () => showTestingTab(name);
  $(`${name}-tab`).onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'planets' : event.key === 'End' ? 'motion' : name === 'planets' ? 'motion' : 'planets';
    showTestingTab(next);
    $(`${next}-tab`).focus();
  };
}
$('clear-planet-form').onclick = () => {
  $('planet-form').reset();
  $('planet-added').textContent = '';
  updatePlacementHint();
  $('new-name').focus();
};
function updatePlacementHint() {
  const active = $('new-status').value === 'in-progress';
  const source = $('new-source').value;
  $('placement-hint').textContent = active
    ? `Starts in the ${source === 'Redmine' ? 'inner Redmine' : 'outer ClickUp'} orbit.`
    : 'Starts on the outer waiting ring. Enter orbit whenever you’re ready.';
}
$('new-source').onchange = updatePlacementHint;
$('new-status').onchange = updatePlacementHint;
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
$('planet-form').onsubmit = event => {
  event.preventDefault();
  const name = $('new-name').value.trim();
  if (!name) return;
  const source = $('new-source').value;
  const active = $('new-status').value === 'in-progress';
  const orbit = active ? source === 'Redmine' ? 4.2 : 7.1 : 9.5;
  const orbitalSpeed = active ? source === 'Redmine' ? 0.048 : 0.03 : 0;
  const phase = findOpenPhase(orbit);
  const planet = createPlanet({
    name, source, orbit, phase,
    radius: 0.38 + random() * 0.2,
    color: active ? source === 'Redmine' ? 0x79bfff : 0xa2d3ff : 0x64789b,
    angle: phase - simulationTime * orbitalSpeed,
    speed: orbitalSpeed,
  });
  $('planet-added').textContent = `Added ${name} · ${source} · ${active ? 'In progress' : 'Not started'}`;
  $('new-name').value = '';
  beginFormation(planet);
  select(planet);
};
function select(planet) {
  selected = planet;
  $('selection').hidden = !planet;
  selectionRing.visible = !!planet;
  if (planet) {
    refreshSelection();
    if (matchMedia('(max-width: 700px)').matches) document.querySelector('.controls').open = false;
  }
}
function refreshSelection() {
  if (!selected) return;
  const { name, source, status, transfer, forming, completion } = selected.userData;
  const isWaiting = status === 'not-started';
  const isLeaving = transfer?.kind === 'out';
  const destination = source === 'Redmine' ? 'inner' : 'outer';
  $('planet-name').textContent = name;
  $('complete-planet').disabled = !!forming || !!transfer || !!completion || status === 'completed';
  $('complete-planet').textContent = completion ? 'Completing…' : status === 'completed' ? 'Completed ✓' : 'Complete task ↗';
  $('enter-orbit').hidden = !!completion || status === 'completed';
  if (completion || status === 'completed') {
    $('planet-status').textContent = completion ? 'Completing' : 'Completed';
    $('planet-description').textContent = `${source} · ${completion ? 'Travelling to' : 'Settled in'} the completed system`;
    const stageLabel = { approaching: 'Approaching the centre', circling: 'Circling the centre', stretching: 'Stretching under gravity', breaking: 'Breaking into dust', absorbing: 'Debris falling into the centre', emerging: 'Reassembling in the completed system' };
    $('orbit-hint').textContent = completion ? `${stageLabel[completion.stage] ?? 'Approaching the centre'}${paused ? ' · motion paused' : '…'}` : `Reassembled in the ${destination} ${source} orbit.`;
    return;
  }
  $('planet-status').textContent = forming ? 'Forming' : transfer ? isLeaving ? 'De-orbiting' : 'Entering orbit' : isWaiting ? 'Not started' : 'In progress';
  $('planet-status').classList.toggle('active', !isWaiting);
  $('planet-description').textContent = `${source} · ${isLeaving ? 'Returning to the waiting ring' : isWaiting ? 'Awaiting orbital insertion' : `${destination[0].toUpperCase() + destination.slice(1)} orbit`}`;
  $('enter-orbit').disabled = !!transfer || !!forming;
  $('enter-orbit').textContent = forming ? 'Forming planet…' : transfer ? isLeaving ? 'De-orbiting…' : 'Entering orbit…' : isWaiting ? 'Enter orbit ↗' : 'De-orbit ↗';
  $('orbit-hint').textContent = forming
    ? `Dust is gathering into a new world${paused ? ' · motion paused' : '…'}`
    : transfer
    ? `${isLeaving ? 'Slowing into the outer waiting ring' : `Moving into the ${source} orbit`}${paused ? ' · motion paused' : '…'}`
    : isWaiting
      ? `Start this sample task and join the ${destination} orbit.`
      : 'Return this sample task to not started and coast into the outer waiting ring.';
}
$('enter-orbit').onclick = () => {
  if (!selected || selected.userData.transfer || selected.userData.forming || selected.userData.completion || selected.userData.status === 'completed') return;
  const data = selected.userData;
  const leaving = data.status === 'in-progress';
  const targetOrbit = leaving ? 9.5 : data.source === 'Redmine' ? 4.2 : 7.1;
  const orbitalSpeed = leaving ? 0 : data.source === 'Redmine' ? 0.048 : 0.03;
  const targetColor = new THREE.Color(leaving ? 0x64789b : data.source === 'Redmine' ? 0x79bfff : 0xa2d3ff);
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
};
$('complete-planet').onclick = () => {
  if (!selected) return;
  // A lingering arrival tag must not follow a planet into its completion journey.
  const arrival = arrivals.get(selected);
  if (selected.userData.forming) return;
  if (arrival) { arrival.tag.remove(); arrivals.delete(selected); }
  completionSystem.complete([selected]);
};
$('complete-active').onclick = () => {
  const active = planets.filter(planet => planet.userData.status === 'in-progress' && !planet.userData.forming && !planet.userData.transfer);
  for (const planet of active) {
    const arrival = arrivals.get(planet);
    if (arrival) { arrival.tag.remove(); arrivals.delete(planet); }
  }
  completionSystem.complete(active);
};
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', e => { down = {x:e.clientX, y:e.clientY}; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX-down.x,e.clientY-down.y)>5) return;
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);
  raycaster.setFromCamera(pointer,camera);
  select(raycaster.intersectObjects(planets.filter(planet => planet.visible && !planet.userData.completion && planet.userData.status !== 'completed'))[0]?.object ?? null);
  down = null;
});
$('clear').onclick = () => select(null);
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Resume motion' : 'Pause motion'; refreshSelection(); };
$('reset').onclick = () => { controls.reset(); select(null); };
$('speed').oninput = e => { speed = Number(e.target.value); $('speed-value').textContent = `${speed.toFixed(1)}×`; };
$('frame-limit').onchange = e => { frameLimit = Number(e.target.value); };
$('resolution').onchange = e => { renderer.setPixelRatio(Number(e.target.value)); resize(); };
$('stars').onchange = e => { stars.visible = e.target.checked; };
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { $('fullscreen').textContent = 'Use your browser’s fullscreen'; }
};
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen ↙' : 'Fullscreen ↗'; });
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
    planet.rotation.y = data.spinAngle + simulationTime*0.09;
  }
  if (selected) {
    selectionRing.visible = selected.visible && selected.userData.status !== 'completed';
    selectionRing.position.copy(selected.position);
    selectionRing.quaternion.copy(camera.quaternion);
    selectionRing.scale.setScalar(selected.userData.radius * selected.scale.x);
  }
}
let lastRender = performance.now();
let statsStart = lastRender;
let frames = 0;
let raf;
function animate(now) {
  raf = requestAnimationFrame(animate);
  const elapsed = now-lastRender;
  const interval = frameLimit ? 1000/frameLimit : 0;
  if (elapsed < interval-0.5) return;
  lastRender = now;
  updateScene(Math.min(elapsed/1000,0.1));
  updateFormations(Math.min(elapsed/1000,0.1));
  completionSystem.update(Math.min(elapsed/1000,0.1), paused, speed);
  controls.update();
  updateArrivalTags();
  renderer.render(scene,camera);
  completionSystem.render(renderer.getPixelRatio());
  frames++;
  if (now-statsStart >= 1000) {
    $('fps').textContent = `${Math.round(frames*1000/(now-statsStart))} fps`;
    $('stats').textContent = `${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles.toLocaleString()} triangles`;
    frames = 0;
    statsStart = now;
  }
}
updateScene(0);
raf = requestAnimationFrame(animate);
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(raf);
  if (!document.hidden) {
    lastRender = statsStart = performance.now();
    frames = 0;
    raf = requestAnimationFrame(animate);
  }
});
