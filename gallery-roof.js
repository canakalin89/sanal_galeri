// Koridorların üzerinde yükselen cam fenerler; bütün koleksiyon aynı salonda kalır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryRoof = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function layout(plan) {
    const edges = [-plan.width / 2, ...plan.partitions.map(p => p.x), plan.width / 2];
    const halfDepth = plan.depth / 2 - 0.9;
    const rows = Math.max(2, Math.ceil(halfDepth * 2 / 6) * 2);
    const base = plan.height + 0.2;
    const bays = edges.slice(0, -1).map((left, i) => {
      const minX = left + (i === 0 ? 0.9 : 0.4);
      const maxX = edges[i + 1] - (i === edges.length - 2 ? 0.9 : 0.4);
      return { minX, maxX, centerX: (minX + maxX) / 2, rise: Math.min(1.05, (maxX - minX) * 0.19) };
    });
    return { bays, base, halfDepth, rows, width: plan.width, depth: plan.depth, ridgeHeight: base + Math.max(...bays.map(b => b.rise)),
      rafters: Array.from({ length: rows + 1 }, (_, i) => -halfDepth + i * halfDepth * 2 / rows) };
  }

  // Yağışın alt sınırı gerçek çatı eğimini izler; damlalar camın içinden geçmez.
  function surfaceHeight(roof, x, z) {
    if (Math.abs(z) > roof.halfDepth) return roof.base;
    const bay = roof.bays.find(b => x >= b.minX && x <= b.maxX);
    return bay ? roof.base + bay.rise * (1 - Math.abs(x - bay.centerX) / ((bay.maxX - bay.minX) / 2)) : roof.base;
  }

  function confineParticle(roof, particle) {
    const wrap = (value, span) => ((value + span / 2) % span + span) % span - span / 2;
    particle.x = wrap(particle.x, roof.width);
    particle.z = wrap(particle.z, roof.depth);
    if (particle.y < surfaceHeight(roof, particle.x, particle.z) + 0.18) particle.y = roof.ridgeHeight + 14;
  }

  function create(THREE, plan) {
    const roof = layout(plan), group = new THREE.Group(); group.name = 'Cam fener tavan';
    const materials = {
      stone: new THREE.MeshStandardMaterial({ color: 0xdeddd5, roughness: 0.88 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x354345, roughness: 0.46, metalness: 0.35 }),
      oak: new THREE.MeshStandardMaterial({ color: 0xb29875, roughness: 0.78 }),
      light: new THREE.MeshBasicMaterial({ color: 0xffebcf, toneMapped: false }),
      glass: new THREE.MeshStandardMaterial({ color: 0xcce2e6, roughness: 0.1, metalness: 0.12,
        transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
    };
    const batches = new Map(), dummy = new THREE.Object3D(), axis = new THREE.Vector3(0, 1, 0);
    function save(key) {
      if (!batches.has(key)) batches.set(key, []);
      dummy.updateMatrix(); batches.get(key).push(dummy.matrix.clone());
    }
    function box(key, x, y, z, width, height, depth) {
      dummy.position.set(x, y, z); dummy.quaternion.identity(); dummy.scale.set(width, height, depth); save(key);
    }
    function beam(a, b, width, depth, key = 'frame') {
      const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
      dummy.position.copy(start).add(end).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(axis, delta.clone().normalize());
      dummy.scale.set(width, delta.length(), depth); save(key);
    }
    const h = plan.height, w = plan.width, d = plan.depth;
    // Kapalı çevre bandı ve sergi duvarlarının üstündeki dar taşıyıcı bantlar.
    for (const side of [-1, 1]) {
      box('stone', side * (w / 2 - 0.38), h + 0.06, 0, 1.04, 0.12, d + 0.28);
      box('stone', 0, h + 0.06, side * (d / 2 - 0.38), w - 1.8, 0.12, 1.04);
    }
    for (const partition of plan.partitions) box('stone', partition.x, h + 0.06, 0, 0.8, 0.12, roof.halfDepth * 2);

    for (const bay of roof.bays) {
      const width = bay.maxX - bay.minX, ridge = roof.base + bay.rise;
      for (const x of [bay.minX, bay.maxX]) {
        box('stone', x, h + 0.16, 0, 0.16, 0.2, roof.halfDepth * 2);
        beam([x, roof.base, -roof.halfDepth], [x, roof.base, roof.halfDepth], 0.09, 0.11);
        box('light', x + (x < bay.centerX ? -0.09 : 0.09), h - 0.015, 0, 0.035, 0.025, roof.halfDepth * 2);
      }
      beam([bay.centerX, ridge, -roof.halfDepth], [bay.centerX, ridge, roof.halfDepth], 0.095, 0.12);
      for (const z of roof.rafters) {
        beam([bay.minX, roof.base, z], [bay.centerX, ridge, z], 0.08, 0.13);
        beam([bay.centerX, ridge, z], [bay.maxX, roof.base, z], 0.08, 0.13);
        // İnce ahşap alt kiriş çerçeveyi tamamlar; tavanda büyük opak ışık panosu yok.
        box('oak', bay.centerX, h + 0.025, z, width, 0.15, 0.1);
      }
      for (let i = 0; i < roof.rows; i++) {
        const z = (roof.rafters[i] + roof.rafters[i + 1]) / 2;
        const length = roof.rafters[i + 1] - roof.rafters[i];
        for (const side of [-1, 1]) {
          dummy.position.set(bay.centerX + side * width / 4, roof.base + bay.rise / 2 + 0.025, z);
          const angle = -side * Math.atan2(bay.rise, width / 2);
          dummy.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle)
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
          dummy.scale.set(Math.hypot(width / 2, bay.rise), length, 1); save('glass');
        }
      }
      // Fenerin iki üçgen uç yüzü de camdır; açık hava deliği bırakılmaz.
      for (const z of [-roof.halfDepth, roof.halfDepth]) {
        box('stone', bay.centerX, h + 0.16, z, width, 0.2, 0.16);
        box('gable', bay.centerX, roof.base, z, width, bay.rise, 1);
      }
    }
    // Avizeler camdan değil taşıyıcı alt kirişten asılır.
    for (const lamp of plan.decor.chandeliers) box('frame', lamp.x, h - 0.015, lamp.z, 0.09, 0.1, 0.16);

    const cube = new THREE.BoxGeometry(1, 1, 1), pane = new THREE.PlaneGeometry(1, 1);
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute('position', new THREE.Float32BufferAttribute([-0.5,0,0, 0.5,0,0, 0,1,0], 3));
    triangle.computeVertexNormals();
    for (const [key, transforms] of batches) {
      const glazed = key === 'glass' || key === 'gable';
      const mesh = new THREE.InstancedMesh(key === 'glass' ? pane : key === 'gable' ? triangle : cube, glazed ? materials.glass : materials[key], transforms.length);
      transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = !glazed && key !== 'light'; mesh.receiveShadow = !glazed && key !== 'light';
      if (glazed) mesh.renderOrder = 2;
      group.add(mesh);
    }
    group.userData.glassMaterial = materials.glass;
    group.userData.layout = roof;
    return group;
  }
  return { layout, surfaceHeight, confineParticle, create };
});
