import * as THREE from 'three';

// A second scene renders only while the shared completion glimpse is open.
export function createCompletionSystem({ scene, rock, random, onChange }) {
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

  const grainCount = 384;
  const dustStart = 4.8;
  const breakupDuration = 12.5;
  const closeSpeed = 0.85;
  const dustSpeed = 0.9; // Gentle motion continues through deformation and breakup.
  const outwardDuration = 3.6;
  const dustEnd = dustStart + breakupDuration;
  const outwardEnd = dustEnd + outwardDuration;
  const formationEnd = outwardEnd + 3.5;
  const settledEnd = formationEnd + 1.5;
  function dust(grainRadius) {
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(grainRadius, 0), new THREE.MeshStandardMaterial({ color: 0x79bfff, roughness: 1, flatShading: true, transparent: true, opacity: 0, depthWrite: false }), grainCount);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    return mesh;
  }
  function disposeDust(mesh, owner) {
    owner.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  // Each surface triangle becomes a closed wedge of the original planet volume.
  // All wedges share one dynamic mesh, keeping simultaneous completions inexpensive.
  function fracture(planet) {
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
    scene.add(mesh);
    return { mesh, pieces, rotation: null };
  }
  function complete(planets) {
    for (const planet of planets) {
      const data = planet.userData;
      if (data.forming || data.transfer || data.completion || data.status === 'completed') continue;
      const targetOrbit = data.source === 'Redmine' ? 4.2 : 7.1;
      const occupied = settled.filter(item => item.orbit === targetOrbit).length
        + [...journeys.values()].filter(item => item.targetOrbit === targetOrbit).length;
      const targetPhase = 0.6 + occupied * 2.39996;
      const copy = new THREE.Mesh(planet.geometry, planet.material.clone());
      copy.rotation.copy(planet.rotation);
      copy.scale.setScalar(0.001);
      copy.visible = false;
      world.add(copy);
      const incoming = dust(0.045);
      const outgoing = dust(0.04);
      scene.add(incoming);
      world.add(outgoing);
      const fragments = fracture(planet);
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
      const journey = { elapsed: 0, startOrbit: data.orbit, startPhase: Math.atan2(planet.position.z, planet.position.x), startSpeed: data.speed, targetOrbit, targetPhase, copy, incoming, outgoing, grains, fragments };
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
    for (const [planet, j] of journeys) {
      j.elapsed += step;
      // One shrinking orbit, not a radial approach followed by a separate close circle.
      const orbitProgress = clamp(j.elapsed / dustStart, 0, 1);
      const u = orbitProgress;
      const halfTurn = Math.PI * (3 * u * u - 2 * u ** 3)
        + dustStart * j.startSpeed * (u ** 3 - 2 * u * u + u)
        + dustStart * closeSpeed * (u ** 3 - u * u);
      const disruptionTime = Math.max(0, j.elapsed - dustStart);
      const breakup = clamp(disruptionTime / breakupDuration, 0, 1);
      const closeRadius = 1.45 + planet.userData.radius + 0.3;
      // Ease the small speed change; avoid a velocity jump at the start of disruption.
      const angle = j.startPhase + halfTurn + closeSpeed * disruptionTime
        + (dustSpeed - closeSpeed) * (disruptionTime - 1 + Math.exp(-disruptionTime));
      const radius = THREE.MathUtils.lerp(j.startOrbit, closeRadius, smooth(u, 0, 1));
      planet.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      if (j.elapsed < dustStart) planet.rotation.y += step * 0.7;
      planet.visible = j.elapsed < dustStart;
      // No shrinking spherical emitter: the actual surface becomes separating wedges.
      const fragments = j.fragments;
      let sampleStream;
      if (fragments) {
        if (j.elapsed >= dustStart && !fragments.rotation) fragments.rotation = planet.quaternion.clone();
        fragments.mesh.visible = j.elapsed >= dustStart;
        const rotation = fragments.rotation || planet.quaternion;
        const attr = fragments.mesh.geometry.attributes.position;
        const point = new THREE.Vector3();
        const baseAngle = j.startPhase + Math.PI;
        const stretch = smooth(disruptionTime, 0, 5);
        const wrap = Math.PI * 1.65 * smooth(disruptionTime, 1.5, 7);
        // The leading end sweeps around once, then stops turning as the ribbon drains inward.
        const slow = clamp((disruptionTime - 6) / 2, 0, 1);
        const advance = closeSpeed * (Math.min(disruptionTime, 6) + 2 * (slow - slow ** 3 + 0.5 * slow ** 4));
        function streamPoint(local, out) {
          const radial = local.x * Math.cos(baseAngle) + local.z * Math.sin(baseAngle);
          const tangent = -local.x * Math.sin(baseAngle) + local.z * Math.cos(baseAngle);
          const side = clamp((radial / planet.userData.radius + 1) * 0.5, 0, 1);
          const a = baseAngle + advance - wrap * (side - 0.5);
          const fall = smooth(disruptionTime, 8 + side * 2, 10 + side * 2.5);
          const r = (closeRadius + radial + stretch * (4 * side - 0.35)) * (1 - fall);
          const width = (1 - stretch * 0.88) * (1 - fall);
          out.set(Math.cos(a) * r - Math.sin(a) * tangent * width,
            local.y * width, Math.sin(a) * r + Math.cos(a) * tangent * width);
          return side;
        }
        sampleStream = streamPoint;
        fragments.pieces.forEach((piece, index) => {
          const local = piece.rotatedCentre.copy(piece.centre).applyQuaternion(rotation);
          const side = streamPoint(local, piece.worldCentre);
          // Continuous vertex deformation makes the whole body become a ribbon before dispersing.
          const erosion = smooth(disruptionTime, 2.5 + side * 1.2, 5.5 + side * 1.2);
          piece.erosion = erosion;
          piece.fall = smooth(disruptionTime, 8 + side * 2, 10 + side * 2.5);
          piece.vertices.forEach((vertex, k) => {
            point.copy(vertex).add(piece.centre).applyQuaternion(rotation);
            streamPoint(point, point);
            point.lerp(piece.worldCentre, erosion);
            attr.setXYZ(index * 12 + k, point.x, point.y, point.z);
          });
        });
        attr.needsUpdate = true;
        fragments.mesh.geometry.computeVertexNormals();
      }
      const stage = j.elapsed < 2 ? 'approaching' : j.elapsed < dustStart ? 'circling' : disruptionTime < 2.5 ? 'stretching' : disruptionTime < 8 ? 'breaking' : j.elapsed < dustEnd ? 'absorbing' : 'emerging';
      if (j.stage !== stage) { j.stage = stage; onChange(planet); }
      const growth = smooth(j.elapsed, outwardEnd, formationEnd);
      const targetAngle = j.targetPhase + Math.max(0, j.elapsed - outwardEnd) * 0.035;
      j.copy.position.set(Math.cos(targetAngle) * j.targetOrbit, 0, Math.sin(targetAngle) * j.targetOrbit);
      j.copy.visible = j.elapsed >= outwardEnd;
      j.copy.scale.setScalar(Math.max(0.001, growth));
      j.copy.rotation.y += step * 0.09;
      j.grains.forEach((grain, i) => {
        // Dust samples the original body volume and undergoes the same deformation as its surface.
        const erosion = smooth(disruptionTime, 2.5 + grain.side * 1.2, 5.5 + grain.side * 1.2);
        const fall = smooth(disruptionTime, 8 + grain.side * 2, 10 + grain.side * 2.5);
        const dustReveal = smooth(erosion, 0.05, 0.85);
        const spread = Math.sin(breakup * Math.PI) * 0.1 * (1 - fall);
        if (sampleStream && j.incoming) {
          sampleStream(grain.origin, dummy.position);
          dummy.position.x += Math.cos(grain.offset) * spread;
          dummy.position.z += Math.sin(grain.offset) * spread;
          dummy.position.y += grain.height * spread;
          dummy.rotation.set(angle, grain.offset, angle * 0.7);
          dummy.scale.setScalar(grain.size * dustReveal * (1 - smooth(fall, 0.65, 1)));
          dummy.updateMatrix();
          j.incoming.setMatrixAt(i, dummy.matrix);
        }
        // Stagger grains along the same outward spiral so the cloud reads as a stream.
        const q = smooth(clamp((j.elapsed - dustEnd - grain.delay * 2.5) / outwardDuration, 0, 1), 0, 1);
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
        j.incoming.material.opacity = 0.85;
        if (j.elapsed >= dustEnd) {
          disposeDust(j.incoming, scene);
          j.incoming = null;
          disposeDust(j.fragments.mesh, scene);
          j.fragments = null;
        }
      }
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
        disposeDust(j.outgoing, world);
        settled.push({ mesh: j.copy, orbit: j.targetOrbit, phase: targetAngle });
        planet.userData.completion = null;
        planet.userData.status = 'completed';
        journeys.delete(planet);
        onChange(planet);
      }
    }
    if (show) {
      closing = 0;
      panel.hidden = false;
      panel.style.opacity = String(previewOpacity);
      panel.dataset.phase = previewPhase;
      caption.textContent = `${visibleCount > 1 ? `${visibleCount} worlds` : latestName} · ${previewPhase === 'forming' ? 'Reassembling' : previewPhase === 'settled' ? 'Settled in orbit' : 'Emerging'}`;
    } else if (!panel.hidden && !journeys.size) {
      closing += step;
      panel.style.opacity = String(1 - smooth(closing, 0, 0.75));
      if (closing >= 0.75) panel.hidden = true;
    }
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
  return { complete, update, render };
}
