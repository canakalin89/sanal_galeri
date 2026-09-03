// Mimari kodla uretilir; yerel dekor modelleri yuklenemezse prosedurel yedekler kalir.
(function () {
  function create(THREE, plan, exhibitionName, schoolName) {
    const group = new THREE.Group();
    const w = plan.width, d = plan.depth, h = plan.height;
    const wall = new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.9 });
    // Cok hafif mineral siva varyasyonu duvarlari duz bilgisayar yuzeyi gorunumunden cikarir.
    wall.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGallerySurface;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGallerySurface = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGallerySurface;\nfloat galleryNoise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat plaster = galleryNoise(floor(vGallerySurface.xy * 95.0));\ndiffuseColor.rgb *= 0.988 + plaster * 0.024;');
    };
    wall.customProgramCacheKey = () => 'gallery-plaster-v1';
    const trim = new THREE.MeshStandardMaterial({ color: 0x303a3c, roughness: 0.8 });
    const oak = new THREE.MeshStandardMaterial({ color: 0xa88762, roughness: 0.9 });
    const ceiling = new THREE.MeshBasicMaterial({ color: 0xe2e3df });
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff5df, toneMapped: false });
    const glass = new THREE.MeshStandardMaterial({
      color: 0xdce9e9, roughness: 0.15, metalness: 0.08, transparent: true,
      opacity: 0.08, side: THREE.DoubleSide, depthWrite: false
    });
    function box(x, y, z, sx, sy, sz, material, castShadow = true) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
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
    const relief = document.createElement('canvas'); relief.width = relief.height = 128;
    const reliefContext = relief.getContext('2d');
    const reliefPixels = reliefContext.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const index = (y * 128 + x) * 4;
      const grain = 112 + ((x * 37 + y * 57 + x * y * 13) % 28);
      reliefPixels.data[index] = reliefPixels.data[index + 1] = reliefPixels.data[index + 2] = grain;
      reliefPixels.data[index + 3] = 255;
    }
    reliefContext.putImageData(reliefPixels, 0, 0);
    const floorRelief = new THREE.CanvasTexture(relief);
    floorRelief.wrapS = floorRelief.wrapT = THREE.RepeatWrapping;
    floorRelief.repeat.copy(floorTexture.repeat);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({
      map: floorTexture, bumpMap: floorRelief, bumpScale: 0.025, roughness: 0.78, metalness: 0.02
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    box(0, h + 0.06, 0, w + 0.3, 0.12, d + 0.3, ceiling, false);
    box(0, h / 2, -d / 2 - 0.1, w + 0.4, h, 0.2, wall);
    box(-w / 2 - 0.1, h / 2, 0, 0.2, h, d, wall);
    box(w / 2 + 0.1, h / 2, 0, 0.2, h, d, wall);

    // Eser bulunmayan giris cephesindeki iki gercek aciklik dogal isigi salona alir.
    const centerWallWidth = Math.min(4.2, w - 2.4);
    const sideSpan = (w - centerWallWidth) / 2;
    const openingWidth = Math.max(0.72, sideSpan - 0.48);
    const openingBottom = 0.58, openingTop = h - 0.58;
    box(0, h / 2, d / 2 + 0.1, centerWallWidth, h, 0.2, wall);
    for (const side of [-1, 1]) {
      const centerX = side * (centerWallWidth / 2 + sideSpan / 2);
      box(centerX, openingBottom / 2, d / 2 + 0.1, sideSpan, openingBottom, 0.2, wall);
      box(centerX, (openingTop + h) / 2, d / 2 + 0.1, sideSpan, h - openingTop, 0.2, wall);
      for (const edge of [-1, 1]) box(centerX + edge * (openingWidth / 2 + 0.12), (openingBottom + openingTop) / 2, d / 2 + 0.1, 0.24, openingTop - openingBottom, 0.2, wall);
      // Camın arkasına resim yapıştırılmaz; bütün pencereler aynı 3D çevreye bakar.
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(openingWidth, openingTop - openingBottom), glass);
      pane.position.set(centerX, (openingBottom + openingTop) / 2, d / 2 + 0.05); pane.rotation.y = Math.PI; pane.renderOrder = 2; group.add(pane);
      box(centerX, (openingBottom + openingTop) / 2, d / 2 + 0.025, 0.045, openingTop - openingBottom, 0.035, trim, false);
      box(centerX, openingBottom + (openingTop - openingBottom) * 0.53, d / 2 + 0.025, openingWidth, 0.045, 0.035, trim, false);
    }
    group.userData.dayNight = { glassMaterial: glass };
    // İnce gölge derzi, açık meşe üst bant ve duvar boyunca ışık çizgisi.
    for (const z of [-d / 2 + 0.025, d / 2 - 0.025]) {
      box(0, 0.08, z, w, 0.16, 0.05, trim);
      box(0, h - 0.23, z, w, 0.22, 0.1, oak);
      box(0, h - 0.39, z + (z < 0 ? 0.02 : -0.02), w - 0.2, 0.035, 0.04, glow, false);
    }
    for (const x of [-w / 2 + 0.025, w / 2 - 0.025]) {
      box(x, 0.08, 0, 0.05, 0.16, d, trim);
      box(x, h - 0.23, 0, 0.1, 0.22, d, oak);
      box(x + (x < 0 ? 0.02 : -0.02), h - 0.39, 0, 0.04, 0.035, d - 0.2, glow, false);
    }
    // Çift yüzlü sergi duvarları koleksiyon büyüdükçe tek salonu dolu ve gezilebilir tutar.
    for (const partition of plan.partitions) {
      box(partition.x, (h - 0.3) / 2, partition.z, 0.18, h - 0.3, partition.length, wall);
      box(partition.x, 0.08, partition.z, 0.24, 0.16, partition.length, trim);
      box(partition.x, h - 0.22, partition.z, 0.28, 0.14, partition.length, oak);
    }

    function contactShadow(x, z, sx, sz, opacityScale = 1) {
      const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, toneMapped: false,
        uniforms: { strength: { value: opacityScale } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float strength; varying vec2 vUv; void main() { vec2 p = (vUv - 0.5) * 2.0; float fade = 1.0 - smoothstep(0.12, 1.0, dot(p, p)); gl_FragColor = vec4(0.08, 0.10, 0.09, fade * 0.2 * strength); }'
      });
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), material);
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(x, 0.012, z); shadow.renderOrder = 1;
      group.add(shadow);
    }

    // Hafif banklar kalicidir; bitki ve avize yedekleri gercek modeller yuklenene kadar salonu doldurur.
    const rugMaterial = new THREE.MeshStandardMaterial({ color: 0x8c5e52, roughness: 0.95 });
    const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x7a5a45, roughness: 0.82 });
    const potMaterial = new THREE.MeshStandardMaterial({ color: 0xa86e52, roughness: 0.9 });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x496b58, roughness: 0.88 });
    for (const bench of plan.decor.benches) {
      contactShadow(bench.x, bench.z, 2.25, 0.95);
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.55), rugMaterial);
      rug.rotation.x = -Math.PI / 2; rug.position.set(bench.x, 0.008, bench.z); group.add(rug);
      const fallback = new THREE.Group(); fallback.userData.proceduralDecor = 'bench';
      const legMaterial = trim.clone();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.58), seatMaterial);
      seat.position.y = 0.48; seat.castShadow = seat.receiveShadow = true; fallback.add(seat);
      for (const x of [-0.7, 0.7]) for (const z of [-0.2, 0.2]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.08), legMaterial);
        leg.position.set(x, 0.23, z); leg.castShadow = leg.receiveShadow = true; fallback.add(leg);
      }
      fallback.position.set(bench.x, 0, bench.z); group.add(fallback);
    }
    for (const plant of plan.decor.plants) {
      contactShadow(plant.x, plant.z, 0.92, 0.92, 0.8);
      const fallback = new THREE.Group(); fallback.userData.decorFallback = 'plant';
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.23, 0.48, 16), potMaterial);
      pot.position.y = 0.24; pot.castShadow = pot.receiveShadow = true; fallback.add(pot);
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.85, 7), leafMaterial);
        const angle = i / 7 * Math.PI * 2;
        leaf.position.set(Math.cos(angle) * 0.13, 0.78 + (i % 2) * 0.08, Math.sin(angle) * 0.13);
        leaf.rotation.z = Math.cos(angle) * 0.38; leaf.rotation.x = Math.sin(angle) * 0.38;
        leaf.castShadow = leaf.receiveShadow = true; fallback.add(leaf);
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
        box(center, h - 0.083, z, panelWidth - 0.1, 0.012, 0.74, glow, false);
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
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) box(side * (1.72 + i * 0.11), 1.95, d / 2 - 0.035, 0.045, 2.55, 0.07, oak);
    return group;
  }
  window.GalleryRoom = { create };
})();
