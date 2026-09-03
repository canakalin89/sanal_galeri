// Bütün mimari kodla üretilir; GLB model, rastgele dekor veya uzak doku kullanılmaz.
(function () {
  function create(THREE, plan, exhibitionName, schoolName) {
    const group = new THREE.Group();
    const w = plan.width, d = plan.depth, h = plan.height;
    const wall = new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.96 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x303a3c, roughness: 0.8 });
    const oak = new THREE.MeshStandardMaterial({ color: 0xa88762, roughness: 0.9 });
    const ceiling = new THREE.MeshBasicMaterial({ color: 0xe2e3df });
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff5df, toneMapped: false });
    function box(x, y, z, sx, sy, sz, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    }
    // Büyük taş plaklar, çok hafif derz; eserlerle yarışan desen yok.
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const ctx = tile.getContext('2d');
    ctx.fillStyle = '#c9cbc7'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#b9bdb8'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, 256, 256);
    const floorTexture = new THREE.CanvasTexture(tile);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(w / 1.6, d / 1.6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);
    box(0, h + 0.06, 0, w + 0.3, 0.12, d + 0.3, ceiling);
    box(0, h / 2, -d / 2 - 0.1, w + 0.4, h, 0.2, wall);
    box(0, h / 2, d / 2 + 0.1, w + 0.4, h, 0.2, wall);
    box(-w / 2 - 0.1, h / 2, 0, 0.2, h, d, wall);
    box(w / 2 + 0.1, h / 2, 0, 0.2, h, d, wall);
    // İnce gölge derzi, açık meşe üst bant ve duvar boyunca ışık çizgisi.
    for (const z of [-d / 2 + 0.025, d / 2 - 0.025]) {
      box(0, 0.08, z, w, 0.16, 0.05, trim);
      box(0, h - 0.23, z, w, 0.22, 0.1, oak);
      box(0, h - 0.39, z + (z < 0 ? 0.02 : -0.02), w - 0.2, 0.035, 0.04, glow);
    }
    for (const x of [-w / 2 + 0.025, w / 2 - 0.025]) {
      box(x, 0.08, 0, 0.05, 0.16, d, trim);
      box(x, h - 0.23, 0, 0.1, 0.22, d, oak);
      box(x + (x < 0 ? 0.02 : -0.02), h - 0.39, 0, 0.04, 0.035, d - 0.2, glow);
    }
    // Çift yüzlü sergi duvarları koleksiyon büyüdükçe tek salonu dolu ve gezilebilir tutar.
    for (const partition of plan.partitions) {
      box(partition.x, (h - 0.3) / 2, partition.z, 0.18, h - 0.3, partition.length, wall);
      box(partition.x, 0.08, partition.z, 0.24, 0.16, partition.length, trim);
      box(partition.x, h - 0.22, partition.z, 0.28, 0.14, partition.length, oak);
    }

    // Hafif banklar kalıcıdır; bitki ve avize yedekleri gerçek modeller yüklenene kadar salonu doldurur.
    const rugMaterial = new THREE.MeshStandardMaterial({ color: 0x8c5e52, roughness: 0.95 });
    const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x7a5a45, roughness: 0.82 });
    const potMaterial = new THREE.MeshStandardMaterial({ color: 0xa86e52, roughness: 0.9 });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x496b58, roughness: 0.88 });
    for (const bench of plan.decor.benches) {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.55), rugMaterial);
      rug.rotation.x = -Math.PI / 2; rug.position.set(bench.x, 0.008, bench.z); group.add(rug);
      const fallback = new THREE.Group(); fallback.userData.proceduralDecor = 'bench';
      const legMaterial = trim.clone();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.58), seatMaterial);
      seat.position.y = 0.48; fallback.add(seat);
      for (const x of [-0.7, 0.7]) for (const z of [-0.2, 0.2]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.08), legMaterial);
        leg.position.set(x, 0.23, z); fallback.add(leg);
      }
      fallback.position.set(bench.x, 0, bench.z); group.add(fallback);
    }
    for (const plant of plan.decor.plants) {
      const fallback = new THREE.Group(); fallback.userData.decorFallback = 'plant';
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.23, 0.48, 16), potMaterial);
      pot.position.y = 0.24; fallback.add(pot);
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.85, 7), leafMaterial);
        const angle = i / 7 * Math.PI * 2;
        leaf.position.set(Math.cos(angle) * 0.13, 0.78 + (i % 2) * 0.08, Math.sin(angle) * 0.13);
        leaf.rotation.z = Math.cos(angle) * 0.38; leaf.rotation.x = Math.sin(angle) * 0.38;
        fallback.add(leaf);
      }
      fallback.position.set(plant.x, 0, plant.z); fallback.rotation.y = plant.rotation; group.add(fallback);
    }
    for (const chandelier of plan.decor.chandeliers) {
      const fallback = new THREE.Group(); fallback.userData.decorFallback = 'chandelier';
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), oak.clone());
      stem.position.y = h - 0.3; fallback.add(stem);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.38, 0.26, 18), glow.clone());
      shade.position.y = h - 0.62; fallback.add(shade);
      fallback.position.set(chandelier.x, 0, chandelier.z); group.add(fallback);
    }

    // Her koridorun üzerindeki tekrarlayan paneller salonun tamamını ritmik biçimde aydınlatır.
    const boundaries = [-w / 2, ...plan.partitions.map(partition => partition.x), w / 2];
    for (let z = -d / 2 + 2; z <= d / 2 - 1.5; z += 3) {
      for (let i = 0; i < boundaries.length - 1; i++) {
        const center = (boundaries[i] + boundaries[i + 1]) / 2;
        const panelWidth = Math.min(boundaries[i + 1] - boundaries[i] - 1.1, 4.8);
        box(center, h - 0.045, z, panelWidth, 0.06, 0.85, trim);
        box(center, h - 0.083, z, panelWidth - 0.1, 0.012, 0.74, glow);
      }
    }
    // Giriş duvarı sabit bir kimlik alanıdır; ortada görüşü kesen pano yok.
    const sign = document.createElement('canvas'); sign.width = 1200; sign.height = 420;
    const text = sign.getContext('2d');
    text.fillStyle = '#263d47'; text.fillRect(0, 0, 1200, 420);
    text.fillStyle = '#c5aa83'; text.fillRect(64, 55, 70, 6);
    text.fillStyle = '#e8e6de';
    text.font = '24px sans-serif'; text.fillText(schoolName, 64, 112, 1072);
    text.font = '500 52px sans-serif';
    // Uzun isimler iki satıra bölünür; tam metin ayrıca HTML başlıkta bulunur.
    const words = exhibitionName.split(/\s+/); let line = '', row = 0;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (text.measureText(next).width > 1072 && line && row === 0) { text.fillText(line, 64, 198, 1072); line = word; row++; }
      else line = next;
    }
    text.fillText(line, 64, 198 + row * 65, 1072);
    text.fillStyle = '#b7cbd1'; text.font = '24px sans-serif';
    text.fillText(plan.count + ' ESER   ·   TEK SALON', 64, 360);
    const texture = new THREE.CanvasTexture(sign); texture.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.19), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    plaque.position.set(0, 1.9, d / 2 - 0.06); plaque.rotation.y = Math.PI;
    group.add(plaque);
    // Düşey ahşap çıtalar giriş alanını tanımlar; yürüyüş sınırının dışındadır.
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) box(side * (2.05 + i * 0.13), 1.95, d / 2 - 0.035, 0.045, 2.55, 0.07, oak);
    return group;
  }
  window.GalleryRoom = { create };
})();
