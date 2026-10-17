import * as THREE from 'three';

// A second scene renders only while the shared completion glimpse is open.
// The centre is a black hole: `core` holds its glow sprite, point light and accretion disc,
// which swell while it feeds and flare when the last of a planet crosses the horizon.
export function createCompletionSystem({ scene, rock, random, onChange, core }) {
  const panel = document.getElementById('completed-preview');
  const caption = document.getElementById('completion-caption');
  const previewCanvas = document.getElementById('completed-space');
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
  camera.position.set(0, 15, 20);
  camera.zoom = 1.5;
  camera.lookAt(0, 0, 0);
  world.add(new THREE.AmbientLight(0xa6c9e8, 1.4));
  const light = new THREE.DirectionalLight(0xe3f3ff, 4);
  light.position.set(-6, 9, 5);
  world.add(light);
  world.add(rock(1.15, 0xa2d3ff, 1));
  for (const [radius, color] of [[4.2, 0x79bfff], [7.1, 0xa2d3ff]]) {
    const points = Array.from({ length: 161 }, (_, i) => {
      const a = i / 160 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    });
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 })));
  }
  const journeys = new Map();
  const settled = [];
  const dummy = new THREE.Object3D();
  let renderer;
  let closing = 0;
  const smooth = THREE.MathUtils.smoothstep;
  const clamp = THREE.MathUtils.clamp;
  const easeOut = x => 1 - (1 - x) ** 3;
  const point = new THREE.Vector3();
  const tint = new THREE.Color();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // Event horizon: the surface of the central body. Matter heats as it nears it, then
  // redshifts to nothing as it crosses.
  const horizon = 1.45;
  const cool = new THREE.Color(0x79bfff);
  const hot = new THREE.Color(0xbfe4ff).multiplyScalar(1.5); // Hot, but still the blue palette.
  const redshifted = new THREE.Color(0x0a1426);
  const discTilt = 0.12; // Matches the accretion disc in scene.js.
  const base = { glow: core.glow.scale.x, light: core.light.intensity };
  let alert = 0; // Brief pulse when a planet is captured.
  let feeding = 0; // Smoothed rate at which grains are crossing the horizon (fraction per second).
  let flareAge = Infinity;
  let glimpse = 0; // Reduced motion: seconds left on a plain settled-system glimpse.
  let glimpseName = '';
  let lastCaption = '';

  // Photon ring and polar jets: one shared flare, restarted by each completion that ends.
  const photonRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.06, 128, 1), new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  photonRing.rotation.x = -Math.PI / 2 + discTilt;
  photonRing.visible = false;
  scene.add(photonRing);
  const jets = new THREE.Group();
  jets.rotation.x = discTilt;
  jets.visible = false;
  {
    // Open cone from the horizon to the tip, fading to black (invisible under additive blending).
    const geometry = new THREE.CylinderGeometry(0.02, 0.18, 1, 20, 8, true).translate(0, 0.5, 0);
    const shade = [];
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const fade = (1 - position.getY(i)) ** 1.6;
      shade.push(hot.r * fade * 0.35, hot.g * fade * 0.4, hot.b * fade * 0.5);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3));
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const direction of [1, -1]) {
      const jet = new THREE.Mesh(geometry, material);
      jet.rotation.z = direction > 0 ? 0 : Math.PI;
      jets.add(jet);
    }
  }
  scene.add(jets);
  function updateCore(step) {
    alert *= Math.exp(-step * 2.2);
    flareAge += step;
    const flare = flareAge < 2.4 ? smooth(flareAge, 0, 0.08) * (1 - smooth(flareAge, 0.1, 2.4)) : 0;
    const energy = alert + Math.min(feeding * 2.5, 1.2) + flare * 1.6;
    core.glow.scale.setScalar(base.glow * (1 + 0.3 * energy));
    core.glow.material.color.setScalar(1 + energy);
    core.light.intensity = base.light * (1 + 1.4 * energy);
    core.disc.material.color.setScalar(1 + 0.6 * energy);
    photonRing.visible = flareAge < 1.6;
    if (photonRing.visible) {
      const t = flareAge / 1.6;
      photonRing.scale.setScalar(horizon * 1.05 + easeOut(t) * 2.6);
      photonRing.material.opacity = 0.9 * (1 - smooth(t, 0.15, 1));
    }
    jets.visible = flareAge < 2.4;
    if (jets.visible) {
      const length = 7 * easeOut(clamp(flareAge / 0.55, 0, 1));
      for (const jet of jets.children) jet.scale.set(1 + flareAge * 0.25, Math.max(0.001, length), 1 + flareAge * 0.25);
      jets.children[0].material.opacity = 0.8 * smooth(flareAge, 0, 0.12) * (1 - smooth(flareAge, 0.4, 2.4));
    }
  }
  // A thin ring spreads from the planet the moment it is completed: it has been captured.
  function ripple(planet) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1, 1.08, 64, 1), new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(planet.position);
    scene.add(mesh);
    return mesh;
  }
  function disposeMesh(mesh, owner) {
    owner.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  const grainCount = 384;
  const strippedCount = 64; // Grains torn off the planet's surface before it breaks up.
  const outwardDuration = 3.6;
  // Every body (planet, chunk, grain) follows one gravity law. On capture the black hole's pull
  // wakes up from the GM that held the planet on its ring to full strength, so the planet speeds
  // up along its orbit with no radial kick. Angular speed is always Keplerian, sqrt(GM / r^3),
  // while the orbit decays at dr/dt = -decay / r: each lap is tighter and faster than the last.
  // Just above the horizon, past the last stable orbit, matter plunges.
  const gravity = 26;
  const captureTime = 2.5;
  const substep = 1 / 120; // Fixed integration step, so the paths do not depend on frame rate.
  const kickTime = 0.7; // Decay time of the push that separates chunks at breakup.
  function fall(body, dt, gm, decay) {
    const plunge = 1 + 2.5 * (1 - smooth(body.r, horizon, horizon + 0.7));
    body.r = Math.max(horizon - 0.2, body.r - decay / body.r * plunge * dt);
    body.theta += Math.sqrt(gm / body.r ** 3) * dt;
  }
  // The decay that carries a body from one radius to another in `duration` seconds (before the plunge).
  const decayFor = (from, to, duration) => (from ** 2 - to ** 2) / (2 * duration);
  const place = (body, out) => out.set(Math.cos(body.theta) * body.r, body.y, Math.sin(body.theta) * body.r);
  // A body offset by a world-space vector from another, expressed on the same orbit.
  function offsetBody(body, offset) {
    const c = Math.cos(body.theta), s = Math.sin(body.theta);
    const radial = offset.x * c + offset.z * s;
    const along = -offset.x * s + offset.z * c;
    return { r: body.r + radial, theta: body.theta + along / body.r, y: body.y + offset.y, radial, along };
  }
  // Infalling grains are unlit so they can glow as they heat; the reborn stream is lit normally.
  function dust(grainRadius, heated) {
    const material = heated
      ? new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: 0x79bfff, roughness: 1, flatShading: true, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(grainRadius, 0), material, grainCount);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (heated) for (let i = 0; i < grainCount; i++) mesh.setColorAt(i, cool);
    mesh.frustumCulled = false;
    return mesh;
  }
  // Each surface triangle becomes a closed wedge of the original planet volume.
  // All wedges share one dynamic mesh, keeping simultaneous completions inexpensive.
  function fracture(planet, owner) {
    const source = planet.geometry.attributes.position;
    const colors = planet.geometry.attributes.color;
    const positions = [], shades = [], pieces = [];
    for (let i = 0; i < source.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(source, i);
      const b = new THREE.Vector3().fromBufferAttribute(source, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(source, i + 2);
      const centre = a.clone().add(b).add(c).multiplyScalar(0.25);
      const vertices = [a, b, c, a, new THREE.Vector3(), b, b, new THREE.Vector3(), c, c, new THREE.Vector3(), a];
      pieces.push({ centre, rotatedCentre: new THREE.Vector3(), worldCentre: new THREE.Vector3(), vertices: vertices.map(v => v.clone().sub(centre)) });
      for (let k = 0; k < vertices.length; k++) {
        positions.push(0, 0, 0);
        const shade = k < 3 ? 1 : 0.78;
        shades.push(colors.getX(i) * shade, colors.getY(i) * shade, colors.getZ(i) * shade);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(geometry, planet.material.clone());
    mesh.frustumCulled = false;
    mesh.visible = false;
    owner.add(mesh);
    return { mesh, pieces, shades: Float32Array.from(shades), rotation: null };
  }
  // Past the tidal limit the planet crumbles: each wedge becomes a chunk on its own orbit,
  // starting exactly where it sat in the planet and pushed gently outward from its centre.
  function breakApart(planet, j, t) {
    j.broken = true;
    j.breakTime = t;
    const rotation = j.fragments.rotation = planet.quaternion.clone();
    for (const piece of j.fragments.pieces) {
      const offset = piece.rotatedCentre.copy(piece.centre).applyQuaternion(rotation);
      const length = offset.length() || 1;
      const body = offsetBody(j.body, offset);
      piece.body = body;
      piece.startRadius = body.r;
      piece.push = { radial: body.radial / length * piece.kick, along: body.along / length * piece.kick, up: offset.y / length * piece.kick };
      piece.decay = decayFor(body.r, horizon, piece.infall);
    }
  }
  // Grains come off their parent (the planet before breakup, then a chunk) as it falls,
  // and spiral in on their own, some faster and some slower than what shed them.
  function release(grain, j, parentBody, decay, t) {
    point.set(random() - 0.5, random() - 0.5, random() - 0.5);
    point.multiplyScalar(grain.parent < 0 ? j.radius / (point.length() || 1) : 0.25);
    grain.body = offsetBody(parentBody, point);
    grain.decay = decay * grain.drag;
    grain.released = t;
  }
  // Advances one journey's bodies in fixed substeps; returns how much matter crossed the horizon.
  function simulate(planet, j, from, step) {
    if (j.dustEnd !== Infinity) return 0;
    let crossed = 0;
    const steps = Math.min(Math.ceil(step / substep), 600);
    const dt = steps ? step / steps : 0;
    const pieces = j.fragments?.pieces ?? [];
    for (let n = 0; n < steps; n++) {
      const t = from + (n + 1) * dt;
      const capture = smooth(t, 0, captureTime);
      const gm = j.gm0 + (gravity - j.gm0) * capture;
      if (!j.broken) {
        fall(j.body, dt, gm, j.decay * capture);
        if (j.body.r <= j.roche) breakApart(planet, j, t);
      } else {
        const since = t - j.breakTime;
        const push = Math.exp(-since / kickTime);
        const settle = smooth(since, 0, 1.5); // Chunks settle from the planet's decay into their own.
        // The crumbling planet first drifts on as one loose cloud (its centre keeps the planet's
        // orbit), then each chunk gradually takes its own orbit, so the debris does not shear
        // into a streak the moment it breaks.
        const cohesion = 1 - smooth(since, 0.4, 3.5);
        fall(j.body, dt, gm, j.decay);
        const cloudSpin = Math.sqrt(gm / j.body.r ** 3) * dt;
        for (const piece of pieces) {
          if (piece.swallowed) continue;
          const body = piece.body;
          const theta = body.theta;
          fall(body, dt, gm, j.decay + (piece.decay - j.decay) * settle);
          body.theta = theta + (body.theta - theta) * (1 - cohesion) + cloudSpin * cohesion;
          body.r += piece.push.radial * push * dt;
          body.theta += piece.push.along * push * dt / body.r;
          body.y += (piece.push.up * push - body.y * 0.8) * dt; // Flattens into the disc plane.
          if (body.r <= horizon) { piece.swallowed = true; j.left--; crossed += 3; }
        }
      }
      for (const grain of j.grains) {
        if (grain.swallowed) continue;
        if (!grain.body) {
          if (grain.parent < 0) {
            // Tidal stripping: the surface starts coming away in the last stretch before breakup.
            if (j.broken || j.body.r <= j.roche + 0.35 * (1 - grain.threshold)) release(grain, j, j.body, j.decay * capture, t);
          } else if (j.broken) {
            const piece = pieces[grain.parent];
            if (piece.swallowed) { grain.swallowed = true; j.left--; crossed++; continue; }
            const shed = (piece.startRadius - piece.body.r) / (piece.startRadius - horizon);
            if (shed >= grain.threshold) release(grain, j, piece.body, piece.decay, t);
          }
          if (!grain.body) continue;
        }
        fall(grain.body, dt, gm, grain.decay);
        grain.body.y -= grain.body.y * 0.8 * dt;
        if (grain.body.r <= horizon) { grain.swallowed = true; j.left--; crossed++; }
      }
    }
    return crossed;
  }
  function complete(planets) {
    for (const planet of planets) {
      const data = planet.userData;
      if (data.forming || data.transfer || data.completion || data.status === 'completed') continue;
      if (reducedMotion.matches) {
        // No journey: the planet appears settled, with a short still glimpse of where it went.
        restore(planet);
        glimpse = 2.5;
        glimpseName = data.name;
        onChange(planet);
        continue;
      }
      const targetOrbit = data.source === 'Redmine' ? 4.2 : 7.1;
      const occupied = settled.filter(item => item.orbit === targetOrbit).length
        + [...journeys.values()].filter(item => item.targetOrbit === targetOrbit).length;
      const targetPhase = 0.6 + occupied * 2.39996;
      const copy = new THREE.Mesh(planet.geometry, planet.material.clone());
      copy.rotation.copy(planet.rotation);
      copy.visible = false;
      world.add(copy);
      const incoming = dust(0.045, true);
      const outgoing = dust(0.04, false);
      scene.add(incoming);
      world.add(outgoing);
      const fragments = fracture(planet, scene);
      fragments.mesh.material.emissive = cool.clone();
      fragments.mesh.material.emissiveIntensity = 0;
      for (const piece of fragments.pieces) {
        piece.axis = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
        piece.spin = (0.6 + random() * 1.6) * (random() < 0.5 ? -1 : 1);
        piece.quaternion = new THREE.Quaternion();
        piece.kick = 0.08 + random() * 0.14;
        piece.infall = 3 + random() * 1.5; // Seconds to drain from the tidal limit to the horizon.
      }
      // The same wedges condense out of the reborn dust and lock back together.
      const assembly = fracture(planet, world);
      for (const piece of assembly.pieces) {
        piece.delay = random() * 1.4;
        piece.angle = random() * Math.PI * 2;
        piece.distance = 0.9 + random() * 0.7;
        piece.height = (random() - 0.5) * 0.6;
      }
      alert = Math.max(alert, 0.45);
      const pieceCount = fragments.pieces.length;
      const grains = Array.from({ length: grainCount }, (_, i) => ({
        parent: i < strippedCount ? -1 : (i - strippedCount) % pieceCount, // -1: the intact planet.
        threshold: i < strippedCount ? (i + 0.5) / strippedCount : random() * 0.85,
        drag: 0.7 + random() * 1.3, body: null, released: 0, swallowed: false,
        delay: random() * 0.22, offset: random() * Math.PI * 2, height: (random() - 0.5) * 0.2, size: 0.4 + random(),
      }));
      // Inside the tidal limit the planet cannot hold together. It decays there in a few seconds,
      // a little longer from the outer ring.
      const roche = 2.2 + data.radius * 1.2;
      const body = { r: data.orbit, theta: Math.atan2(planet.position.z, planet.position.x), y: 0 };
      const decay = decayFor(data.orbit, roche, 3.3 + 0.5 * (data.orbit - roche));
      // GM that kept the planet circling at its ring speed, so capture starts with no jolt.
      const gm0 = data.speed ** 2 * data.orbit ** 3;
      const journey = { elapsed: 0, dustEnd: Infinity, body, roche, decay, gm0, radius: data.radius, broken: false, breakTime: 0,
        left: pieceCount + grainCount, targetOrbit, targetPhase, copy, incoming, outgoing, grains, fragments, assembly, ripple: ripple(planet) };
      data.completion = journey;
      journeys.set(planet, journey);
      onChange(planet);
    }
  }
  function update(delta, paused, speed) {
    const step = paused ? 0 : delta * speed;
    for (const item of settled) {
      item.phase += step * 0.035;
      item.mesh.position.set(Math.cos(item.phase) * item.orbit, 0, Math.sin(item.phase) * item.orbit);
      item.mesh.rotation.y += step * 0.09;
    }
    let show = false;
    let latestName = '';
    let visibleCount = 0;
    let previewPhase = 'settled';
    let previewOpacity = 1;
    let swallowedNow = 0;
    for (const [planet, j] of journeys) {
      const from = j.elapsed;
      j.elapsed += step;
      const crossed = simulate(planet, j, from, step);
      // Everything has crossed (or a stalled journey timed out): the completed system opens.
      if (j.dustEnd === Infinity && j.broken && (j.left <= 0 || j.elapsed > 45)) j.dustEnd = j.elapsed;
      const dustEnd = j.dustEnd;
      const outwardEnd = dustEnd + outwardDuration;
      const formationEnd = outwardEnd + 3.5;
      const settledEnd = formationEnd + 1.5;
      const since = j.broken ? j.elapsed - j.breakTime : 0;
      if (!j.broken) {
        place(j.body, planet.position);
        planet.rotation.y += step * 0.7;
      }
      planet.visible = !j.broken;
      if (j.ripple) {
        const t = clamp(j.elapsed / 1.4, 0, 1);
        j.ripple.position.copy(planet.position);
        j.ripple.scale.setScalar(planet.userData.radius * (1.3 + easeOut(t) * 2.2));
        j.ripple.material.opacity = 0.75 * (1 - smooth(t, 0.05, 1));
        if (t >= 1) { disposeMesh(j.ripple, scene); j.ripple = null; }
      }
      // The planet's own wedges, now chunks: each tumbles, sheds dust, heats and fades at the horizon.
      const fragments = j.fragments;
      if (fragments) {
        fragments.mesh.visible = j.broken;
        if (j.broken) {
          fragments.mesh.material.emissiveIntensity = 0.4 * smooth(since, 0, 3); // Tidal heating.
          const attr = fragments.mesh.geometry.attributes.position;
          const colours = fragments.mesh.geometry.attributes.color;
          const shades = fragments.shades;
          fragments.pieces.forEach((piece, index) => {
            const r = piece.body.r;
            const remaining = piece.swallowed ? 0 : smooth(r, horizon - 0.05, horizon + 0.25);
            const shed = clamp((piece.startRadius - r) / (piece.startRadius - horizon), 0, 1);
            const scale = (1 - 0.45 * shed) * remaining; // Lighter as it sheds its dust.
            const heat = 0.5 * (1 - smooth(r, horizon + 0.3, 3.4));
            const crossing = smooth(r, horizon, horizon + 0.4);
            place(piece.body, piece.worldCentre);
            piece.quaternion.setFromAxisAngle(piece.axis, piece.spin * since).multiply(fragments.rotation);
            piece.vertices.forEach((vertex, k) => {
              const v = index * 12 + k;
              point.copy(vertex).applyQuaternion(piece.quaternion).multiplyScalar(scale).add(piece.worldCentre);
              attr.setXYZ(v, point.x, point.y, point.z);
              tint.fromArray(shades, v * 3).lerp(hot, heat).lerp(redshifted, 1 - crossing);
              colours.setXYZ(v, tint.r, tint.g, tint.b);
            });
          });
          attr.needsUpdate = true; // Flat shading derives normals per face, so none are recomputed.
          colours.needsUpdate = true;
        }
      }
      const stage = j.elapsed < captureTime ? 'approaching' : !j.broken ? 'circling' : since < 2.5 ? 'breaking' : j.elapsed < dustEnd ? 'absorbing' : 'emerging';
      if (j.stage !== stage) { j.stage = stage; onChange(planet); }
      const growth = smooth(j.elapsed, outwardEnd, formationEnd);
      const targetAngle = j.targetPhase + Math.max(0, j.elapsed - outwardEnd) * 0.035;
      j.copy.position.set(Math.cos(targetAngle) * j.targetOrbit, 0, Math.sin(targetAngle) * j.targetOrbit);
      j.copy.rotation.y += step * 0.09;
      j.copy.visible = j.elapsed >= formationEnd;
      if (j.assembly) {
        assemble(j, outwardEnd, formationEnd);
        if (j.elapsed >= formationEnd) { disposeMesh(j.assembly.mesh, world); j.assembly = null; }
      }
      j.grains.forEach((grain, i) => {
        if (j.incoming) {
          if (grain.body && !grain.swallowed) {
            const r = grain.body.r;
            place(grain.body, dummy.position);
            // Debris heats as it falls, then redshifts to nothing as it crosses the horizon.
            const heat = 1 - smooth(r, horizon + 0.3, 3.4);
            const crossing = smooth(r, horizon, horizon + 0.4);
            j.incoming.setColorAt(i, tint.copy(cool).lerp(hot, heat).lerp(redshifted, 1 - crossing));
            const remaining = smooth(r, horizon - 0.05, horizon + 0.2);
            dummy.rotation.set(grain.body.theta, grain.offset, grain.body.theta * 0.7);
            dummy.scale.setScalar(grain.size * smooth(j.elapsed - grain.released, 0, 0.35) * remaining);
          } else {
            dummy.position.setScalar(0);
            dummy.scale.setScalar(0);
          }
          dummy.updateMatrix();
          j.incoming.setMatrixAt(i, dummy.matrix);
        }
        // Stagger grains along the same outward spiral so the cloud reads as a stream.
        // Thrown out fast from the centre, slowing as it reaches the orbit.
        const q = easeOut(clamp((j.elapsed - dustEnd - grain.delay * 2.5) / outwardDuration, 0, 1));
        const outAngle = targetAngle - 4.7 * (1 - q);
        const outRadius = j.targetOrbit * q;
        const gathering = (1 - growth) * 0.85;
        const swirl = grain.offset + j.elapsed * 1.2;
        dummy.position.set(Math.cos(outAngle) * outRadius + Math.cos(swirl) * gathering, grain.height * gathering, Math.sin(outAngle) * outRadius + Math.sin(swirl) * gathering);
        dummy.scale.setScalar(grain.size * smooth(j.elapsed, dustEnd + grain.delay, dustEnd + 0.5 + grain.delay) * (1 - growth));
        dummy.updateMatrix();
        j.outgoing.setMatrixAt(i, dummy.matrix);
      });
      if (j.incoming) {
        j.incoming.instanceMatrix.needsUpdate = true;
        j.incoming.instanceColor.needsUpdate = true;
        j.incoming.material.opacity = 0.85;
        if (j.elapsed >= dustEnd) {
          disposeMesh(j.incoming, scene);
          j.incoming = null;
          disposeMesh(j.fragments.mesh, scene);
          j.fragments = null;
        }
      }
      swallowedNow += crossed;
      // The last of the planet crossing the horizon makes the black hole flare and fire its jets,
      // just as the completed system opens.
      if (!j.flared && j.elapsed >= dustEnd) { j.flared = true; flareAge = 0; }
      j.outgoing.instanceMatrix.needsUpdate = true;
      j.outgoing.material.opacity = 0.85 * smooth(j.elapsed, dustEnd, dustEnd + 0.6);
      if (j.elapsed >= dustEnd) {
        show = true;
        visibleCount++;
        latestName = planet.userData.name;
        previewPhase = j.elapsed < outwardEnd ? 'emerging' : j.elapsed < formationEnd ? 'forming' : 'settled';
        previewOpacity = smooth(j.elapsed, dustEnd, dustEnd + 0.3);
      }
      if (j.elapsed >= settledEnd) {
        disposeMesh(j.outgoing, world);
        settled.push({ planet, mesh: j.copy, orbit: j.targetOrbit, phase: targetAngle });
        planet.userData.completion = null;
        planet.userData.status = 'completed';
        journeys.delete(planet);
        onChange(planet);
      }
    }
    if (step > 0) feeding += (swallowedNow / grainCount / step - feeding) * (1 - Math.exp(-step * 4));
    updateCore(step);
    if (glimpse > 0 && !show) {
      glimpse -= delta;
      show = glimpse > 0;
      latestName = glimpseName;
      visibleCount = 1;
    }
    if (show) {
      closing = 0;
      panel.hidden = false;
      panel.style.opacity = String(previewOpacity);
      panel.dataset.phase = previewPhase;
      const text = `${visibleCount > 1 ? `${visibleCount} worlds` : latestName} · ${previewPhase === 'forming' ? 'Reassembling' : previewPhase === 'settled' ? 'Settled in orbit' : 'Emerging'}`;
      // A live region: only write when the words change, so screen readers announce once.
      if (text !== lastCaption) caption.textContent = lastCaption = text;
    } else if (!panel.hidden && !journeys.size) {
      closing += step;
      panel.style.opacity = String(1 - smooth(closing, 0, 0.75));
      if (closing >= 0.75) panel.hidden = true;
    }
  }
  // Reverse of the breakup: wedges condense out of the arriving dust, spiral in and lock onto
  // the copy's exact surface, so swapping to the solid copy at formationEnd is seamless.
  function assemble(j, outwardEnd, formationEnd) {
    const { mesh, pieces } = j.assembly;
    const start = outwardEnd - 0.6;
    mesh.visible = j.elapsed >= start && j.elapsed < formationEnd;
    if (!mesh.visible) return;
    const attr = mesh.geometry.attributes.position;
    const travel = formationEnd - start - 1.6; // Latest delay is 1.4s; all are in place 0.2s early.
    const rotation = j.copy.quaternion;
    pieces.forEach((piece, index) => {
      const p = clamp((j.elapsed - start - piece.delay) / travel, 0, 1);
      const settle = easeOut(p);
      const open = smooth(p, 0.3, 1); // Each wedge grows from its centroid as it arrives.
      const swirl = piece.angle + (1 - settle) * 2.4;
      const reach = piece.distance * (1 - settle);
      piece.worldCentre.copy(piece.centre).applyQuaternion(rotation).add(j.copy.position);
      piece.worldCentre.x += Math.cos(swirl) * reach;
      piece.worldCentre.y += piece.height * (1 - settle);
      piece.worldCentre.z += Math.sin(swirl) * reach;
      piece.vertices.forEach((vertex, k) => {
        point.copy(vertex).applyQuaternion(rotation).multiplyScalar(open).add(piece.worldCentre);
        attr.setXYZ(index * 12 + k, point.x, point.y, point.z);
      });
    });
    attr.needsUpdate = true;
  }
  function render(pixelRatio) {
    if (panel.hidden) return;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true });
      renderer.setClearColor(0x0c1222);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
    }
    const { width, height } = previewCanvas.getBoundingClientRect();
    if (renderer.getPixelRatio() !== pixelRatio || previewCanvas.width !== Math.floor(width * pixelRatio) || previewCanvas.height !== Math.floor(height * pixelRatio)) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    renderer.render(world, camera);
  }
  function remove(planet) {
    const journey = journeys.get(planet);
    if (journey) {
      for (const [mesh, owner] of [[journey.incoming, scene], [journey.outgoing, world], [journey.fragments?.mesh, scene], [journey.assembly?.mesh, world], [journey.ripple, scene]]) {
        if (mesh) disposeMesh(mesh, owner);
      }
      world.remove(journey.copy);
      journey.copy.material.dispose(); // Geometry belongs to the original planet.
      journeys.delete(planet);
    }
    for (let i = settled.length - 1; i >= 0; i--) {
      if (settled[i].planet !== planet) continue;
      world.remove(settled[i].mesh);
      settled[i].mesh.material.dispose();
      settled.splice(i, 1);
    }
    planet.userData.completion = null;
    if (!journeys.size) { panel.hidden = true; closing = 0; }
  }
  function restore(planet) {
    remove(planet);
    const orbit = planet.userData.source === 'Redmine' ? 4.2 : 7.1;
    const phase = (planet.userData.task?.seed ?? 19) % 6283 / 1000;
    const copy = new THREE.Mesh(planet.geometry, planet.material.clone());
    copy.rotation.copy(planet.rotation);
    copy.position.set(Math.cos(phase) * orbit, 0, Math.sin(phase) * orbit);
    world.add(copy);
    settled.push({ planet, mesh: copy, orbit, phase });
    planet.visible = false;
    planet.userData.status = 'completed';
  }
  function settleAll() {
    for (const planet of [...journeys.keys()]) restore(planet);
    alert = feeding = glimpse = 0;
    flareAge = Infinity;
    updateCore(0);
    panel.hidden = true;
    panel.style.opacity = '1';
    closing = 0;
  }
  return { complete, update, render, restore, remove, settleAll };
}
