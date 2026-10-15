import * as THREE from 'three';

// A second scene renders only while the shared completion glimpse is open.
// The centre is a black hole: `core` holds its glow sprite, point light, accretion disc and lensing quad,
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
    core.lens.material.uniforms.energy.value = energy;
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
  // One constant angular acceleration from the moment the task is completed:
  //   omega(t) = omega0 + alpha * t,   theta(t) = omega0 * t + alpha * t^2 / 2
  const alpha = 0.12; // rad/s^2
  const infallAccel = 1.2; // Radial acceleration (units/s^2) of grains falling along the ribbon, from rest.
  const flowStart = 7; // The existing ribbon has finished stretching and shedding its surface.
  const ribbonWrap = Math.PI * 1.65;
  const outwardDuration = 3.6;
  // Time at which theta = PI (the half-turn), solving alpha/2 t^2 + omega0 t - PI = 0.
  function halfTurnTime(omega0) {
    return (Math.sqrt(omega0 ** 2 + 2 * alpha * Math.PI) - omega0) / alpha;
  }
  // Approach radius. The tangential speed v = r * omega only ever rises, as in a gravity well:
  // its acceleration starts at alpha * r0 (spin-up at constant radius, so no radial kick) and
  // fades out exponentially with time constant tau, which is solved so that the planet reaches
  // closeRadius exactly when the half-turn ends. Then r(t) = v(t) / omega(t).
  function approachSpeedGain(omega0, startRadius, closeRadius, duration) {
    const target = (omega0 + alpha * duration) * closeRadius - omega0 * startRadius;
    let low = 0.05, high = 60;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (alpha * startRadius * mid * (1 - Math.exp(-duration / mid)) < target) low = mid; else high = mid;
    }
    return (low + high) / 2;
  }
  function approachRadius(j, t) {
    if (t === 0) return j.startOrbit;
    const speed = j.omega0 * j.startOrbit
      + alpha * j.startOrbit * j.tau * (1 - Math.exp(-Math.min(t, j.dustStart) / j.tau));
    return speed / (j.omega0 + alpha * Math.min(t, j.dustStart));
  }
  // Angle swept by the body between two times under the constant acceleration.
  function swept(omega0, from, to) {
    return omega0 * (to - from) + 0.5 * alpha * (to ** 2 - from ** 2);
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
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
    const mesh = new THREE.Mesh(geometry, planet.material.clone());
    mesh.frustumCulled = false;
    mesh.visible = false;
    owner.add(mesh);
    return { mesh, pieces, rotation: null };
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
      // The same wedges condense out of the reborn dust and lock back together.
      const assembly = fracture(planet, world);
      for (const piece of assembly.pieces) {
        piece.delay = random() * 1.4;
        piece.angle = random() * Math.PI * 2;
        piece.distance = 0.9 + random() * 0.7;
        piece.height = (random() - 0.5) * 0.6;
      }
      alert = Math.max(alert, 0.45);
      const baseAngle = Math.atan2(planet.position.z, planet.position.x) + Math.PI;
      const grains = Array.from({ length: grainCount }, (_, i) => {
        // Stratify through the original volume so stretching cannot reveal empty gaps.
        const side = (i + 0.5) / grainCount;
        const radial = (side * 2 - 1) * data.radius;
        const crossRadius = Math.sqrt(Math.max(0, data.radius ** 2 - radial ** 2)) * Math.sqrt(random());
        const crossAngle = random() * Math.PI * 2;
        const tangent = Math.cos(crossAngle) * crossRadius;
        return { side, origin: new THREE.Vector3(Math.cos(baseAngle) * radial - Math.sin(baseAngle) * tangent,
          Math.sin(crossAngle) * crossRadius, Math.sin(baseAngle) * radial + Math.cos(baseAngle) * tangent),
          delay: random() * 0.22, offset: random() * Math.PI * 2, height: (random() - 0.5) * 0.2, size: 0.4 + random() };
      });
      const omega0 = data.speed;
      const dustStart = halfTurnTime(omega0);
      const tau = approachSpeedGain(omega0, data.orbit, 1.45 + data.radius + 0.3, dustStart);
      // Grains fall along the ribbon from rest: d = g t^2 / 2. The outermost one must drop
      // from its start radius to inside the core.
      const pathSlope = 4 + 2 * data.radius; // Radius gained per unit of ribbon coordinate.
      const outerDrop = pathSlope + 0.4;
      const dustEnd = dustStart + flowStart + Math.sqrt(2 * outerDrop / infallAccel);
      const journey = { elapsed: 0, dustEnd, startOrbit: data.orbit, startPhase: Math.atan2(planet.position.z, planet.position.x), omega0, dustStart, tau, targetOrbit, targetPhase, copy, incoming, outgoing, grains, fragments, assembly, ripple: ripple(planet), swallowed: 0 };
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
      j.elapsed += step;
      const dustEnd = j.dustEnd;
      const outwardEnd = dustEnd + outwardDuration;
      const formationEnd = outwardEnd + 3.5;
      const settledEnd = formationEnd + 1.5;
      // One shrinking orbit, not a radial approach followed by a separate close circle.
      const { dustStart } = j;
      const disruptionTime = Math.max(0, j.elapsed - dustStart);
      const breakup = clamp(disruptionTime / 12.5, 0, 1);
      const closeRadius = 1.45 + planet.userData.radius + 0.3;
      // Constant angular acceleration from the start of the journey, through every stage.
      const angle = j.startPhase + swept(j.omega0, 0, j.elapsed);
      const radius = approachRadius(j, j.elapsed);
      planet.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      if (j.elapsed < dustStart) planet.rotation.y += step * 0.7;
      planet.visible = j.elapsed < dustStart;
      if (j.ripple) {
        const t = clamp(j.elapsed / 1.4, 0, 1);
        j.ripple.position.copy(planet.position);
        j.ripple.scale.setScalar(planet.userData.radius * (1.3 + easeOut(t) * 2.2));
        j.ripple.material.opacity = 0.75 * (1 - smooth(t, 0.05, 1));
        if (t >= 1) { disposeMesh(j.ripple, scene); j.ripple = null; }
      }
      // No shrinking spherical emitter: the actual surface becomes separating wedges.
      const fragments = j.fragments;
      let sampleStream;
      if (fragments) {
        if (j.elapsed >= dustStart && !fragments.rotation) fragments.rotation = planet.quaternion.clone();
        fragments.mesh.visible = j.elapsed >= dustStart && disruptionTime < flowStart;
        fragments.mesh.material.emissiveIntensity = 0.7 * smooth(disruptionTime, 0, 6); // Tidal heating.
        const rotation = fragments.rotation || planet.quaternion;
        const attr = fragments.mesh.geometry.attributes.position;
        const baseAngle = j.startPhase + Math.PI;
        const stretch = smooth(disruptionTime, 0, 5);
        const wrap = ribbonWrap * smooth(disruptionTime, 1.5, 7);
        // The whole ribbon keeps rotating under the same constant acceleration until absorption ends.
        const advance = swept(j.omega0 + alpha * dustStart, 0, disruptionTime);
        // Past flowStart the curl stops growing and grains fall along the same spiral, starting
        // from rest relative to the ribbon (no velocity jump) with constant acceleration.
        const flowTime = Math.max(0, disruptionTime - flowStart);
        const pathSlope = 4 + 2 * planet.userData.radius;
        const fallen = 0.5 * infallAccel * flowTime ** 2;
        const flow = fallen / pathSlope; // Distance fallen, as a ribbon coordinate.
        function streamPoint(local, out) {
          const radial = local.x * Math.cos(baseAngle) + local.z * Math.sin(baseAngle);
          const tangent = -local.x * Math.sin(baseAngle) + local.z * Math.cos(baseAngle);
          const side = clamp((radial / planet.userData.radius + 1) * 0.5, 0, 1);
          const position = side - flow;
          const a = baseAngle + advance - wrap * (position - 0.5);
          // Shift the coordinate along ONE spiral, rather than collapsing each
          // grain's radius from its own angle. Every grain passes the same tip.
          const r = Math.max(0, closeRadius + radial + stretch * (4 * side - 0.35) - fallen);
          const width = (1 - stretch * 0.88) * smooth(r, 1, 1.4);
          out.set(Math.cos(a) * r - Math.sin(a) * tangent * width,
            local.y * width, Math.sin(a) * r + Math.cos(a) * tangent * width);
          return side;
        }
        sampleStream = streamPoint;
        if (fragments.mesh.visible) {
          fragments.pieces.forEach((piece, index) => {
            const local = piece.rotatedCentre.copy(piece.centre).applyQuaternion(rotation);
            const side = streamPoint(local, piece.worldCentre);
            // Continuous vertex deformation makes the whole body become a ribbon before dispersing.
            const erosion = smooth(disruptionTime, 2.5 + side * 1.2, 5.5 + side * 1.2);
            piece.erosion = erosion;
            piece.vertices.forEach((vertex, k) => {
              point.copy(vertex).add(piece.centre).applyQuaternion(rotation);
              streamPoint(point, point);
              point.lerp(piece.worldCentre, erosion);
              attr.setXYZ(index * 12 + k, point.x, point.y, point.z);
            });
          });
          attr.needsUpdate = true; // Flat shading derives normals per face, so none are recomputed.
        }
      }
      const stage = j.elapsed < dustStart * 0.4 ? 'approaching' : j.elapsed < dustStart ? 'circling' : disruptionTime < 2.5 ? 'stretching' : disruptionTime < 8 ? 'breaking' : j.elapsed < dustEnd ? 'absorbing' : 'emerging';
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
      let swallowed = 0;
      j.grains.forEach((grain, i) => {
        // Dust samples the original body volume and undergoes the same deformation as its surface.
        const erosion = smooth(disruptionTime, 2.5 + grain.side * 1.2, 5.5 + grain.side * 1.2);
        const dustReveal = smooth(erosion, 0.05, 0.85);
        if (sampleStream && j.incoming) {
          sampleStream(grain.origin, dummy.position);
          const r = Math.hypot(dummy.position.x, dummy.position.z);
          if (!grain.swallowed && r <= horizon) { grain.swallowed = true; swallowed++; }
          // Debris heats as it falls, then redshifts to nothing as it crosses the horizon.
          const heat = 1 - smooth(r, horizon + 0.3, 3.4);
          const crossing = smooth(r, horizon, horizon + 0.4);
          j.incoming.setColorAt(i, tint.copy(cool).lerp(hot, heat).lerp(redshifted, 1 - crossing));
          const remaining = smooth(r, horizon - 0.05, horizon + 0.2);
          const spread = Math.sin(breakup * Math.PI) * 0.1 * remaining;
          dummy.position.x += Math.cos(grain.offset) * spread;
          dummy.position.z += Math.sin(grain.offset) * spread;
          dummy.position.y += grain.height * spread;
          dummy.rotation.set(angle, grain.offset, angle * 0.7);
          dummy.scale.setScalar(grain.size * dustReveal * remaining);
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
      j.swallowed += swallowed;
      swallowedNow += swallowed;
      // The last grain crossing the horizon makes the black hole flare and fire its jets,
      // just as the completed system opens.
      if (!j.flared && (j.swallowed >= grainCount || j.elapsed >= dustEnd)) { j.flared = true; flareAge = 0; }
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
