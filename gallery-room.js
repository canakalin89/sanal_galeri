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
    // Tekrarlayan tavan panelleri: ışık sayısı eser sayısıyla büyümez.
    for (let z = -d / 2 + 2; z <= d / 2 - 1.5; z += 3) {
      box(0, h - 0.045, z, Math.min(w - 3.2, 5.4), 0.06, 0.85, trim);
      box(0, h - 0.083, z, Math.min(w - 3.3, 5.3), 0.012, 0.74, glow);
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
    text.fillText('SALON ' + (plan.roomIndex + 1) + ' / ' + plan.roomCount + '   ·   ' + plan.count + ' ESER', 64, 360);
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
