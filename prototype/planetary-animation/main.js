// Throwaway animation study: can Orbit's gentle low-poly motion feel good on a second screen?
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
for (const [name, orbit, radius, color, angle, speed, description] of specs) {
  const mesh = rock(radius, color);
  const source = orbit === 4.2 || name === 'Cinder' ? 'Redmine' : 'ClickUp';
  mesh.userData = {
    name, orbit, radius, angle, speed, description, source,
    spinAngle: angle, baseColor: new THREE.Color(color),
    status: speed ? 'in-progress' : 'not-started', transfer: null,
  };
  mesh.rotation.set(random(), random(), random());
  planets.push(mesh);
  scene.add(mesh);
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
function select(planet) {
  selected = planet;
  $('selection').hidden = !planet;
  selectionRing.visible = !!planet;
  if (planet) {
    refreshSelection();
  }
}
function refreshSelection() {
  if (!selected) return;
  const { name, source, status, transfer } = selected.userData;
  const isWaiting = status === 'not-started';
  const isLeaving = transfer?.kind === 'out';
  const destination = source === 'Redmine' ? 'inner' : 'outer';
  $('planet-name').textContent = name;
  $('planet-status').textContent = transfer ? isLeaving ? 'De-orbiting' : 'Entering orbit' : isWaiting ? 'Not started' : 'In progress';
  $('planet-status').classList.toggle('active', !isWaiting);
  $('planet-description').textContent = `${source} · ${isLeaving ? 'Returning to the waiting ring' : isWaiting ? 'Awaiting orbital insertion' : `${destination[0].toUpperCase() + destination.slice(1)} orbit`}`;
  $('enter-orbit').disabled = !!transfer;
  $('enter-orbit').textContent = transfer ? isLeaving ? 'De-orbiting…' : 'Entering orbit…' : isWaiting ? 'Enter orbit ↗' : 'De-orbit ↗';
  $('orbit-hint').textContent = transfer
    ? `${isLeaving ? 'Slowing into the outer waiting ring' : `Moving into the ${source} orbit`}${paused ? ' · motion paused' : '…'}`
    : isWaiting
      ? `Start this sample task and join the ${destination} orbit.`
      : 'Return this sample task to not started and coast into the outer waiting ring.';
}
$('enter-orbit').onclick = () => {
  if (!selected || selected.userData.transfer) return;
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
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', e => { down = {x:e.clientX, y:e.clientY}; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX-down.x,e.clientY-down.y)>5) return;
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);
  raycaster.setFromCamera(pointer,camera);
  select(raycaster.intersectObjects(planets)[0]?.object ?? null);
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
    selectionRing.position.copy(selected.position);
    selectionRing.quaternion.copy(camera.quaternion);
    selectionRing.scale.setScalar(selected.userData.radius);
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
  controls.update();
  renderer.render(scene,camera);
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
