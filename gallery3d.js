// 3D Sanal Sergi Salonu — Three.js ile procedural müze salonu.
// Yalnızca kullanıcı "3D Salonda Gez" butonuna bastığında yüklenir (lazy).
// Dışa açık API: window.openGallery3D(images, exhibitionName), window.closeGallery3D()

(function () {
  const THREE_URL = '/vendor/three.module.js';

  let THREE = null;
  let gltfLoaderPromise = null;
  let renderer, scene, camera, clock;
  let animationId = null;
  let raf = null;

  const state = {
    active: false,
    images: [],
    frames: [],           // { mesh, img, plaqueGroup }
    keys: {},
    yaw: 0,
    pitch: 0,
    velocity: null,        // THREE.Vector3, THREE yüklendikten sonra ayarlanır
    isMobile: false,
    joystick: { active: false, startX: 0, startY: 0, dx: 0, dy: 0 },
    lookTouch: { active: false, lastX: 0, lastY: 0 },
    roomHalfWidth: 6,
    roomHalfDepth: 6,
    wallHeight: 5.2
  };

  function isMobileDevice() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 820;
  }

  async function loadThree() {
    if (THREE) return THREE;
    THREE = await import(THREE_URL);
    return THREE;
  }

  function el(id) { return document.getElementById(id); }

  /* ─── DOKU YARDIMCILARI ──────────────────────────────────── */

  function makePlaqueTexture(title, sub) {
    if (!title && !sub) return null; // ikisi de yoksa plaket hiç oluşturulmaz

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f0ede2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    ctx.textAlign = 'center';

    if (title) {
      ctx.font = '600 34px Georgia, serif';
      ctx.fillStyle = '#1a1711';
      ctx.fillText(truncateText(ctx, title, canvas.width - 40), canvas.width / 2, sub ? 56 : 74);
    }
    if (sub) {
      ctx.font = 'italic 24px Georgia, serif';
      ctx.fillStyle = '#6b6358';
      ctx.fillText(truncateText(ctx, sub, canvas.width - 40), canvas.width / 2, title ? 96 : 74);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 3 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  function makeFloorTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a1e14';
    ctx.fillRect(0, 0, size, size);
    const plank = size / 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const shade = 18 + ((x + y * 3) % 5) * 4;
        ctx.fillStyle = `rgb(${shade + 24}, ${shade + 14}, ${shade + 6})`;
        ctx.fillRect(x * plank, y * plank, plank - 1, plank - 1);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeRugTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4a1f28';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 10;
    ctx.strokeRect(20, 20, size - 40, size - 40);
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, size - 96, size - 96);
    ctx.fillStyle = '#c9a84c';
    [[48, 48], [size - 48, 48], [48, size - 48], [size - 48, size - 48]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ─── SALON ÜRETİMİ ──────────────────────────────────────── */

  function buildRoom(count) {
    const perWallEstimate = Math.max(1, Math.ceil(count / 4));
    const wallLen = Math.max(10, perWallEstimate * 3.4 + 2);
    state.roomHalfWidth = wallLen / 2;
    state.roomHalfDepth = wallLen / 2;

    const group = new THREE.Group();

    // Sıcak, aydınlık müze duvarı (krem/bej) — gerçek bir sanat galerisi izlenimi,
    // "backrooms" hissi veren koyu/soğuk tonlardan kaçınıyoruz
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xede6d8, roughness: 0.92, metalness: 0.0 });
    const floorTex = makeFloorTexture();
    floorTex.repeat.set(wallLen / 2, wallLen / 2);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xdcd3c0, roughness: 1 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(wallLen, wallLen), floorMat);
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(wallLen, wallLen), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = state.wallHeight;
    group.add(ceiling);

    // Ahşap tavan kirişleri — düz tavanı kırıp gerçek bir galeri mimarisi hissi verir
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.8 });
    const beamCount = Math.max(3, Math.round(wallLen / 2.4));
    const beamSpacing = wallLen / (beamCount + 1);
    for (let i = 1; i <= beamCount; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(wallLen, 0.22, 0.28), beamMat);
      beam.position.set(0, state.wallHeight - 0.11, -state.roomHalfDepth + beamSpacing * i);
      group.add(beam);
    }

    // Aydınlatma rayı görünümü — her kiriş boyunca küçük sıcak nokta lambalar
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.6 });
    for (let i = 1; i <= beamCount; i++) {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), trackMat);
      fixture.position.set(0, state.wallHeight - 0.32, -state.roomHalfDepth + beamSpacing * i);
      group.add(fixture);
    }

    const wallGeoNS = new THREE.PlaneGeometry(wallLen, state.wallHeight);
    const wallGeoEW = new THREE.PlaneGeometry(wallLen, state.wallHeight);

    const north = new THREE.Mesh(wallGeoNS, wallMat);
    north.position.set(0, state.wallHeight / 2, -state.roomHalfDepth);
    group.add(north);

    const south = new THREE.Mesh(wallGeoNS, wallMat);
    south.position.set(0, state.wallHeight / 2, state.roomHalfDepth);
    south.rotation.y = Math.PI;
    group.add(south);

    const east = new THREE.Mesh(wallGeoEW, wallMat);
    east.position.set(state.roomHalfWidth, state.wallHeight / 2, 0);
    east.rotation.y = -Math.PI / 2;
    group.add(east);

    const west = new THREE.Mesh(wallGeoEW, wallMat);
    west.position.set(-state.roomHalfWidth, state.wallHeight / 2, 0);
    west.rotation.y = Math.PI / 2;
    group.add(west);

    // Süpürgelik — dört duvarın dibinde altın şerit, odayı "oturmuş" ve bakımlı gösterir
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.4, metalness: 0.6 });
    const baseHeight = 0.12;
    const baseGeoNS = new THREE.BoxGeometry(wallLen - 0.1, baseHeight, 0.06);
    const baseGeoEW = new THREE.BoxGeometry(wallLen - 0.1, baseHeight, 0.06);

    const baseN = new THREE.Mesh(baseGeoNS, baseMat);
    baseN.position.set(0, baseHeight / 2, -state.roomHalfDepth + 0.03);
    group.add(baseN);

    const baseS = new THREE.Mesh(baseGeoNS, baseMat);
    baseS.position.set(0, baseHeight / 2, state.roomHalfDepth - 0.03);
    group.add(baseS);

    const baseE = new THREE.Mesh(baseGeoEW, baseMat);
    baseE.rotation.y = Math.PI / 2;
    baseE.position.set(state.roomHalfWidth - 0.03, baseHeight / 2, 0);
    group.add(baseE);

    const baseW = new THREE.Mesh(baseGeoEW, baseMat);
    baseW.rotation.y = Math.PI / 2;
    baseW.position.set(-state.roomHalfWidth + 0.03, baseHeight / 2, 0);
    group.add(baseW);

    // Tavan pervazı — süpürgeliğin eşi, tepede. Kutu gibi düz bir oda hissini kırar.
    const crownHeight = 0.1;
    const crownY = state.wallHeight - crownHeight / 2 - 0.02;
    const crownGeoNS = new THREE.BoxGeometry(wallLen - 0.1, crownHeight, 0.06);
    const crownGeoEW = new THREE.BoxGeometry(wallLen - 0.1, crownHeight, 0.06);

    const crownN = new THREE.Mesh(crownGeoNS, baseMat);
    crownN.position.set(0, crownY, -state.roomHalfDepth + 0.03);
    group.add(crownN);

    const crownS = new THREE.Mesh(crownGeoNS, baseMat);
    crownS.position.set(0, crownY, state.roomHalfDepth - 0.03);
    group.add(crownS);

    const crownE = new THREE.Mesh(crownGeoEW, baseMat);
    crownE.rotation.y = Math.PI / 2;
    crownE.position.set(state.roomHalfWidth - 0.03, crownY, 0);
    group.add(crownE);

    const crownW = new THREE.Mesh(crownGeoEW, baseMat);
    crownW.rotation.y = Math.PI / 2;
    crownW.position.set(-state.roomHalfWidth + 0.03, crownY, 0);
    group.add(crownW);

    // Köşe pilastırları — dört köşeye ince altın dikey şerit, düz kutu hissini kırar
    const pilasterMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.4, metalness: 0.55 });
    const pilasterGeo = new THREE.BoxGeometry(0.1, state.wallHeight - 0.1, 0.1);
    const cornerOffset = 0.35;
    [
      [state.roomHalfWidth - cornerOffset, -state.roomHalfDepth + cornerOffset],
      [state.roomHalfWidth - cornerOffset, state.roomHalfDepth - cornerOffset],
      [-state.roomHalfWidth + cornerOffset, -state.roomHalfDepth + cornerOffset],
      [-state.roomHalfWidth + cornerOffset, state.roomHalfDepth - cornerOffset]
    ].forEach(([x, z]) => {
      const p = new THREE.Mesh(pilasterGeo, pilasterMat);
      p.position.set(x, state.wallHeight / 2, z);
      group.add(p);
    });

    // Zemin halısı — merkeze sıcaklık ve odak noktası katar, boş/kutu hissini azaltır
    const rugTex = makeRugTexture();
    const rugMat = new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 });
    const rugSize = Math.max(4, Math.min(wallLen * 0.55, wallLen - 3));
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(rugSize, rugSize), rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.008;
    group.add(rug);

    // Seyir bankı — halının üzerinde, gerçek bir galeri mobilyası
    const benchWoodMat = new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 0.6 });
    const benchPadMat = new THREE.MeshStandardMaterial({ color: 0x3a2a30, roughness: 0.85 });
    const benchGroup = new THREE.Group();
    const benchPad = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.55), benchPadMat);
    benchPad.position.y = 0.42;
    benchGroup.add(benchPad);
    [[-0.65, -0.2], [0.65, -0.2], [-0.65, 0.2], [0.65, 0.2]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), benchWoodMat);
      leg.position.set(x, 0.2, z);
      benchGroup.add(leg);
    });
    benchGroup.position.set(0, 0, -1.8); // kamera başlangıç noktasının önünde, kuzey duvarına bakar
    benchGroup.userData.isProceduralFallback = 'bench';
    group.add(benchGroup);

    // Saksılar — köşelere sıcaklık katan basit prosedürel bitkiler
    function makePlant() {
      const plantGroup = new THREE.Group();
      const potMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8 });
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.32, 12), potMat);
      pot.position.y = 0.16;
      plantGroup.add(pot);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d6b3f, roughness: 0.7 });
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.65, 6), leafMat);
        const angle = (i / 6) * Math.PI * 2;
        leaf.position.set(Math.cos(angle) * 0.1, 0.55 + Math.random() * 0.15, Math.sin(angle) * 0.1);
        leaf.rotation.z = Math.cos(angle) * 0.3;
        leaf.rotation.x = Math.sin(angle) * 0.3;
        plantGroup.add(leaf);
      }
      return plantGroup;
    }
    const plantMargin = 1.0;
    [
      [state.roomHalfWidth - plantMargin, state.roomHalfDepth - plantMargin],
      [-state.roomHalfWidth + plantMargin, state.roomHalfDepth - plantMargin],
      [state.roomHalfWidth - plantMargin, -state.roomHalfDepth + plantMargin],
      [-state.roomHalfWidth + plantMargin, -state.roomHalfDepth + plantMargin]
    ].forEach(([x, z]) => {
      const plant = makePlant();
      plant.position.set(x, 0, z);
      plant.userData.isProceduralFallback = 'plant';
      group.add(plant);
    });

    // Sıcak "spot" ışıkları — her duvara bir tane, tavana yakın. Düz/steril
    // görünümü kırıp gerçek bir galeri gibi sıcak ışık havuzları oluşturur.
    const spotColor = 0xffdcae;
    const spotRange = wallLen * 0.9;
    const spotPositions = [
      [0, state.wallHeight - 0.4, -state.roomHalfDepth + 1.5],
      [0, state.wallHeight - 0.4, state.roomHalfDepth - 1.5],
      [state.roomHalfWidth - 1.5, state.wallHeight - 0.4, 0],
      [-state.roomHalfWidth + 1.5, state.wallHeight - 0.4, 0]
    ];
    spotPositions.forEach(p => {
      const light = new THREE.PointLight(spotColor, 1.1, spotRange, 2);
      light.position.set(p[0], p[1], p[2]);
      group.add(light);
    });

    return group;
  }

  /* ─── GERÇEK 3D MODELLER (GLTF/GLB) ──────────────────────── */
  // Prosedürel mobilyaların yerini alır; yüklenemezse sessizce prosedürel
  // halleri korunur (yedek/fallback).

  async function getGLTFLoader() {
    if (gltfLoaderPromise) return gltfLoaderPromise;
    gltfLoaderPromise = (async () => {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('/vendor/loaders/GLTFLoader.js'),
        import('/vendor/loaders/DRACOLoader.js')
      ]);
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('/vendor/draco/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      return loader;
    })();
    return gltfLoaderPromise;
  }

  function loadModel(url) {
    return getGLTFLoader().then(loader => new Promise((resolve, reject) => {
      loader.load(url, gltf => resolve(gltf.scene), undefined, reject);
    }));
  }

  // Modeli verilen hedef boyuta (en büyük eksen) göre ölçekler, tabanını
  // y=0'a, merkezini x/z=0'a oturtur. Ölçeklenmiş boyutu (Vector3) döndürür.
  function normalizeModel(model, targetSize) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar(targetSize / maxDim);

    const box2 = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box2.min.y;

    const finalSize = new THREE.Vector3();
    box2.getSize(finalSize);
    return finalSize;
  }

  function removeFallback(roomGroup, kind) {
    roomGroup.children
      .filter(c => c.userData.isProceduralFallback === kind)
      .forEach(c => roomGroup.remove(c));
  }

  function enhanceRoomWithRealModels(roomGroup) {
    // Seyir bankı
    loadModel('/vendor/models/bench.glb').then(model => {
      normalizeModel(model, 1.7);
      model.position.z += -1.8;
      removeFallback(roomGroup, 'bench');
      roomGroup.add(model);
    }).catch(() => { /* prosedürel bank kalır */ });

    // Saksılı bitki — 4 köşeye aynı modelden klon
    loadModel('/vendor/models/plant.glb').then(model => {
      normalizeModel(model, 1.3);
      removeFallback(roomGroup, 'plant');
      const margin = 1.0;
      [
        [state.roomHalfWidth - margin, state.roomHalfDepth - margin],
        [-state.roomHalfWidth + margin, state.roomHalfDepth - margin],
        [state.roomHalfWidth - margin, -state.roomHalfDepth + margin],
        [-state.roomHalfWidth + margin, -state.roomHalfDepth + margin]
      ].forEach(([x, z]) => {
        const clone = model.clone();
        clone.position.x += x;
        clone.position.z += z;
        roomGroup.add(clone);
      });
    }).catch(() => { /* prosedürel bitkiler kalır */ });

    // Küçük saksı aksanları — çok-nesneli kümeden (plant_accents.glb) tek tek
    // seçilip odanın çeşitli noktalarına (duvar diplerine, banka yakın) dağıtılır.
    loadModel('/vendor/models/plant_accents.glb').then(model => {
      const pots = [];
      model.traverse(child => {
        if (child.isMesh) pots.push(child);
      });
      if (pots.length === 0) return;

      const margin = 0.55;
      const spots = [
        [0, -state.roomHalfDepth + margin],                          // banka yakın (kuzey duvar dibi)
        [state.roomHalfWidth - margin, 0],                           // doğu duvar orta
        [-state.roomHalfWidth + margin, 0],                          // batı duvar orta
        [state.roomHalfWidth - margin, state.roomHalfDepth * 0.5],
        [-state.roomHalfWidth + margin, state.roomHalfDepth * 0.5],
        [state.roomHalfWidth - margin, -state.roomHalfDepth * 0.5],
        [-state.roomHalfWidth + margin, -state.roomHalfDepth * 0.5]
      ];

      spots.forEach((spot, i) => {
        const pot = pots[i % pots.length];
        const clone = pot.clone();
        clone.geometry = pot.geometry; // geometri paylaşılır, dönüştürülmez
        const group = new THREE.Group();
        group.add(clone);
        normalizeModel(group, 0.6);
        group.rotation.y = Math.random() * Math.PI * 2; // yaprakların "kenardan" görünmesini azaltır
        group.position.x += spot[0];
        group.position.z += spot[1];
        roomGroup.add(group);
      });
    }).catch(() => { /* aksan bitkiler olmadan devam */ });

    // Avize — tavan ortasından sarkar
    loadModel('/vendor/models/chandelier.glb').then(model => {
      const size = normalizeModel(model, 1.2);
      model.position.y += state.wallHeight - size.y - 0.05;
      roomGroup.add(model);
    }).catch(() => { /* avize olmadan devam */ });

    // Heykel kaidesi — karşılama panosunun yanında dekoratif podyum
    loadModel('/vendor/models/pedestal.glb').then(model => {
      normalizeModel(model, 1.0);
      model.position.set(2.3, 0, state.roomHalfDepth - 1.6);
      roomGroup.add(model);
    }).catch(() => { /* podyum olmadan devam */ });
  }

  /* ─── ESER ÇERÇEVESİ ─────────────────────────────────────── */

  function loadImageTexture(url) {
    return new Promise(resolve => {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      loader.load(
        url,
        tex => { tex.colorSpace = THREE.SRGBColorSpace; resolve(tex); },
        undefined,
        () => resolve(null)
      );
    });
  }

  async function placeArtworks(roomGroup, images) {
    const wallLen = state.roomHalfWidth * 2;
    const perWall = Math.max(1, Math.ceil(images.length / 4));
    const spacing = wallLen / (perWall + 1);
    const wallDefs = [
      { normal: [0, 0, 1],  base: [0, 0, -state.roomHalfDepth + 0.05], axis: 'x' },
      { normal: [-1, 0, 0], base: [state.roomHalfWidth - 0.05, 0, 0],  axis: 'z' },
      { normal: [0, 0, -1], base: [0, 0, state.roomHalfDepth - 0.05],  axis: 'x', flip: true },
      { normal: [1, 0, 0],  base: [-state.roomHalfWidth + 0.05, 0, 0], axis: 'z', flip: true }
    ];

    const texWidth = state.isMobile ? 640 : 1024;
    let idx = 0;

    for (const wall of wallDefs) {
      for (let i = 0; i < perWall && idx < images.length; i++, idx++) {
        const img = images[idx];
        const offset = -wallLen / 2 + spacing * (i + 1);
        const pos = wall.axis === 'x'
          ? [offset, 2.4, wall.base[2]]
          : [wall.base[0], 2.4, wall.flip ? -offset : offset];

        const frameGroup = new THREE.Group();
        frameGroup.position.set(pos[0], pos[1], pos[2]);
        // Hedef, odanın merkezine doğru (normal yönünde) olduğunda lookAt kimlik
        // rotasyonu üretir: yerel +Z ekseni dünya +normal'e denk gelir. Böylece
        // yerel z>0 (tuval, plaket) izleyiciye yakın, z<0 (çerçeve) duvara yakın olur.
        frameGroup.lookAt(pos[0] + wall.normal[0], pos[1], pos[2] + wall.normal[2]);

        // Yer tutucu (yüklenene kadar)
        // NOT: canvas / çerçeve / plaket arasında Z-fighting olmaması için
        // her katman net bir Z boşluğuyla ayrılıyor (çerçeve arkada, tuval önde).
        const placeholderMat = new THREE.MeshStandardMaterial({ color: 0x1c2c48 });
        const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.0), placeholderMat);
        canvasMesh.position.z = 0.03;
        frameGroup.add(canvasMesh);

        const frameMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.35, metalness: 0.55 });
        const frameThick = 0.08;
        const frameDepth = 0.04;
        const frameBorder = new THREE.Mesh(
          new THREE.BoxGeometry(1.6 + frameThick * 2, 2.0 + frameThick * 2, frameDepth),
          frameMat
        );
        frameBorder.position.z = -0.02;
        frameGroup.add(frameBorder);

        const plaqueTex = makePlaqueTexture(img.title || null, img.artist || null);
        let plaque = null;
        if (plaqueTex) {
          const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex });
          plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), plaqueMat);
          plaque.position.set(0, -1.35, 0.05);
          frameGroup.add(plaque);
        }

        frameGroup.userData.imgData = img;
        frameGroup.userData.canvasMesh = canvasMesh;
        frameGroup.userData.basePosition = frameGroup.position.clone();
        frameGroup.userData.normal = new THREE.Vector3(wall.normal[0], 0, wall.normal[2]);

        roomGroup.add(frameGroup);
        state.frames.push(frameGroup);

        // Doku asenkron yüklenir, yüklenince gerçek boy oranına göre yeniden boyutlanır
        loadImageTexture(img.thumbSrc ? img.thumbSrc.replace(/=w\d+/, '=w' + texWidth) : img.src).then(tex => {
          if (!tex) return;
          const ratio = tex.image.width / tex.image.height;
          let w = 1.8, h = 1.8 / ratio;
          if (h > 2.2) { h = 2.2; w = h * ratio; }
          canvasMesh.geometry.dispose();
          canvasMesh.geometry = new THREE.PlaneGeometry(w, h);
          canvasMesh.material.dispose();
          canvasMesh.material = new THREE.MeshBasicMaterial({ map: tex });

          frameBorder.geometry.dispose();
          frameBorder.geometry = new THREE.BoxGeometry(w + frameThick * 2, h + frameThick * 2, frameDepth);
          if (plaque) plaque.position.y = -(h / 2) - 0.3;
        });
      }
    }
  }

  /* ─── KARŞILAMA PANOSU (okul logosu + sergi bilgisi) ────── */

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function wrapText(ctx, text, maxWidth, maxLines) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    return lines;
  }

  async function addWelcomeSign(roomGroup, schoolName, exhibitionName, description) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f6f2e8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    let logoImg = null;
    try { logoImg = await loadImageElement('/assets/logo.png'); } catch (e) { /* logo olmadan devam */ }

    const padding = 44;
    const logoSize = 220;
    let textX = padding;

    if (logoImg) {
      const lx = padding, ly = (canvas.height - logoSize) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx + logoSize / 2, ly + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, lx, ly, logoSize, logoSize);
      ctx.restore();
      ctx.strokeStyle = '#c9a84c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(lx + logoSize / 2, ly + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.stroke();
      textX = lx + logoSize + 44;
    }

    const textWidth = canvas.width - textX - padding;
    ctx.textAlign = 'left';

    ctx.fillStyle = '#8c8474';
    ctx.font = '600 26px Georgia, serif';
    ctx.fillText(truncateText(ctx, (schoolName || '').toUpperCase(), textWidth), textX, 68);

    ctx.fillStyle = '#1a1711';
    ctx.font = '700 50px Georgia, serif';
    ctx.fillText(truncateText(ctx, exhibitionName || 'Sanal Sergi', textWidth), textX, 128);

    if (description) {
      ctx.font = '23px Georgia, serif';
      ctx.fillStyle = '#4a4438';
      const lines = wrapText(ctx, description, textWidth, 5);
      lines.forEach((line, i) => ctx.fillText(line, textX, 172 + i * 32));
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex });

    const signWidth = Math.min(state.roomHalfWidth * 2 - 1.6, 7.5);
    const signHeight = signWidth * (canvas.height / canvas.width);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(signWidth, signHeight), mat);

    // Güney duvarına (başlangıç noktasının arkasına) asılır — dönüp bakınca görülür,
    // eser çerçeveleriyle çakışmaması için göz hizasının biraz üstüne yerleştirilir
    const y = Math.min(3.1, state.wallHeight - signHeight / 2 - 0.35);
    mesh.position.set(0, y, state.roomHalfDepth - 0.10);
    mesh.rotation.y = Math.PI;
    roomGroup.add(mesh);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.35, metalness: 0.55 });
    const frameBorder = new THREE.Mesh(
      new THREE.BoxGeometry(signWidth + 0.18, signHeight + 0.18, 0.05),
      frameMat
    );
    frameBorder.position.set(0, y, state.roomHalfDepth - 0.04);
    roomGroup.add(frameBorder);
  }

  /* ─── SAHNE KURULUMU ─────────────────────────────────────── */

  function setupScene(container) {
    scene = new THREE.Scene();
    // Daha uzak ve daha aydınlık sis — davetkâr bir salon hissi, ürkütücü karanlık boşluk değil
    const fogColor = 0xd8cfbc;
    scene.fog = new THREE.Fog(fogColor, 16, 34);
    scene.background = new THREE.Color(fogColor);

    camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.65, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Parlak, sıcak genel aydınlatma — flat/steril "backrooms" hissi yerine
    // rahat, gerçek bir müze salonu izlenimi
    const ambient = new THREE.AmbientLight(0xfff1de, 0.95);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff0d0, 0.85);
    dir.position.set(4, 8, 4);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffe8cc, 0.45);
    dir2.position.set(-4, 6, -4);
    scene.add(dir2);

    state.velocity = new THREE.Vector3();
  }

  function onResize(container) {
    if (!renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  /* ─── KONTROLLER ─────────────────────────────────────────── */

  function setupDesktopControls(container) {
    container.addEventListener('click', () => {
      container.requestPointerLock?.();
    });

    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== container) return;
      state.yaw -= e.movementX * 0.0022;
      state.pitch -= e.movementY * 0.0022;
      state.pitch = Math.max(-1.2, Math.min(1.2, state.pitch));
    });

    window.addEventListener('keydown', e => { state.keys[e.code] = true; });
    window.addEventListener('keyup', e => { state.keys[e.code] = false; });
  }

  function setupMobileControls(container) {
    const joyBase = el('gal3d-joy-base');
    const joyStick = el('gal3d-joy-stick');
    if (!joyBase) return;

    joyBase.addEventListener('touchstart', e => {
      const t = e.touches[0];
      state.joystick.active = true;
      state.joystick.startX = t.clientX;
      state.joystick.startY = t.clientY;
    }, { passive: true });

    joyBase.addEventListener('touchmove', e => {
      if (!state.joystick.active) return;
      const t = e.touches[0];
      let dx = t.clientX - state.joystick.startX;
      let dy = t.clientY - state.joystick.startY;
      const max = 40;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      state.joystick.dx = dx / max;
      state.joystick.dy = dy / max;
      joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
    }, { passive: true });

    function resetJoystick() {
      state.joystick.active = false;
      state.joystick.dx = 0;
      state.joystick.dy = 0;
      joyStick.style.transform = 'translate(0,0)';
    }
    joyBase.addEventListener('touchend', resetJoystick);
    joyBase.addEventListener('touchcancel', resetJoystick);

    // Bakınma: ekranın geri kalanında sürükleme
    container.addEventListener('touchstart', e => {
      if (joyBase.contains(e.target)) return;
      const t = e.touches[0];
      state.lookTouch.active = true;
      state.lookTouch.lastX = t.clientX;
      state.lookTouch.lastY = t.clientY;
    }, { passive: true });

    container.addEventListener('touchmove', e => {
      if (!state.lookTouch.active || joyBase.contains(e.target)) return;
      const t = e.touches[0];
      const dx = t.clientX - state.lookTouch.lastX;
      const dy = t.clientY - state.lookTouch.lastY;
      state.yaw -= dx * 0.0035;
      state.pitch -= dy * 0.0035;
      state.pitch = Math.max(-1.2, Math.min(1.2, state.pitch));
      state.lookTouch.lastX = t.clientX;
      state.lookTouch.lastY = t.clientY;
    }, { passive: true });

    container.addEventListener('touchend', e => {
      if (e.touches.length === 0) state.lookTouch.active = false;
    });
  }

  /* ─── HAREKET ────────────────────────────────────────────── */

  function updateMovement(dt) {
    const speed = 3.2;
    let moveX = 0, moveZ = 0;

    if (state.isMobile) {
      moveX = state.joystick.dx;
      moveZ = -state.joystick.dy; // joystick yukarı = ileri
    } else {
      if (state.keys['KeyW'] || state.keys['ArrowUp'])    moveZ += 1;
      if (state.keys['KeyS'] || state.keys['ArrowDown'])  moveZ -= 1;
      if (state.keys['KeyA'] || state.keys['ArrowLeft'])  moveX -= 1;
      if (state.keys['KeyD'] || state.keys['ArrowRight']) moveX += 1;
      const len = Math.hypot(moveX, moveZ);
      if (len > 1) { moveX /= len; moveZ /= len; }
    }

    if (moveX !== 0 || moveZ !== 0) {
      const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const delta = new THREE.Vector3();
      delta.addScaledVector(forward, -moveZ);
      delta.addScaledVector(right, moveX);
      if (delta.lengthSq() > 0) delta.normalize();
      camera.position.addScaledVector(delta, speed * dt);

      const margin = 0.6;
      camera.position.x = Math.max(-state.roomHalfWidth + margin, Math.min(state.roomHalfWidth - margin, camera.position.x));
      camera.position.z = Math.max(-state.roomHalfDepth + margin, Math.min(state.roomHalfDepth - margin, camera.position.z));
    }

    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;
    camera.position.y = 1.65;
  }

  /* ─── MİNİ HARİTA ────────────────────────────────────────── */

  function drawMinimap() {
    const canvas = el('gal3d-minimap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    const roomW = state.roomHalfWidth * 2;
    const roomD = state.roomHalfDepth * 2;
    const scale = (size - 16) / Math.max(roomW, roomD);
    const ox = size / 2, oz = size / 2;

    ctx.fillStyle = 'rgba(237, 230, 216, 0.15)';
    ctx.fillRect(ox - (roomW * scale) / 2, oz - (roomD * scale) / 2, roomW * scale, roomD * scale);
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox - (roomW * scale) / 2, oz - (roomD * scale) / 2, roomW * scale, roomD * scale);

    // Eser noktaları
    ctx.fillStyle = 'rgba(201, 168, 76, 0.9)';
    state.frames.forEach(f => {
      const px = ox + f.position.x * scale;
      const pz = oz + f.position.z * scale;
      ctx.beginPath();
      ctx.arc(px, pz, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Oyuncu konumu + baktığı yön
    const px = ox + camera.position.x * scale;
    const pz = oz + camera.position.z * scale;
    const dirX = -Math.sin(state.yaw), dirZ = -Math.cos(state.yaw);

    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(dirX, -dirZ));
    ctx.fillStyle = '#10b3ff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ─── ANİMASYON DÖNGÜSÜ ──────────────────────────────────── */

  let minimapFrameCount = 0;

  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());
    updateMovement(dt);
    renderer.render(scene, camera);

    minimapFrameCount++;
    if (minimapFrameCount % 3 === 0) drawMinimap(); // performans için 3 karede bir
  }

  /* ─── AÇILIŞ / KAPANIŞ ───────────────────────────────────── */

  async function openGallery3D(images, exhibitionName, exhibitionDescription) {
    if (state.active) return;
    if (!images || images.length === 0) return;

    const overlay = el('gal3d-overlay');
    const container = el('gal3d-canvas-container');
    const loading = el('gal3d-loading');
    if (!overlay || !container) return;

    overlay.classList.remove('hidden');
    loading.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    try {
      await loadThree();
    } catch (err) {
      loading.classList.add('hidden');
      overlay.classList.add('hidden');
      document.body.style.overflow = '';
      alert('3D salon yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.');
      return;
    }

    state.active = true;
    state.images = images;
    state.frames = [];
    state.yaw = 0;
    state.pitch = 0;
    state.keys = {};
    state.isMobile = isMobileDevice();

    el('gal3d-joystick').classList.toggle('hidden', !state.isMobile);
    // Kontrol ipucu artık kalıcı bir HUD — otomatik kaybolmuyor
    el('gal3d-hint').innerHTML = state.isMobile
      ? '<strong>Yürü:</strong> Sol çubuk &nbsp; <strong>Bak:</strong> Ekranı sürükle'
      : '<strong>Yürü:</strong> WASD / Ok tuşları &nbsp; <strong>Bak:</strong> Tıkla + Fare &nbsp; <strong>Çık:</strong> ESC';
    el('gal3d-hint').classList.remove('hidden');
    el('gal3d-minimap-wrap').classList.remove('hidden');
    const schoolName = typeof SCHOOL_NAME !== 'undefined' ? SCHOOL_NAME : 'Sanal Sergi';
    const badgeSchool = el('gal3d-badge-school');
    if (badgeSchool) badgeSchool.textContent = schoolName;

    setupScene(container);
    const room = buildRoom(images.length);
    scene.add(room);
    await placeArtworks(room, images);
    await addWelcomeSign(room, schoolName, exhibitionName, exhibitionDescription);
    enhanceRoomWithRealModels(room); // arka planda yüklenir, hazır olunca sahneye eklenir

    if (state.isMobile) {
      setupMobileControls(container);
    } else {
      setupDesktopControls(container);
    }

    window.addEventListener('resize', () => onResize(container));
    window.addEventListener('keydown', escListener);

    clock = new THREE.Clock();
    loading.classList.add('hidden');
    animate();
  }

  function escListener(e) {
    if (e.code === 'Escape') closeGallery3D();
  }

  function closeGallery3D() {
    if (!state.active) return;
    state.active = false;
    cancelAnimationFrame(raf);
    if (document.pointerLockElement) document.exitPointerLock();
    window.removeEventListener('keydown', escListener);

    const container = el('gal3d-canvas-container');
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    }
    scene = null; camera = null; renderer = null;
    state.frames = [];

    el('gal3d-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  window.openGallery3D = openGallery3D;
  window.closeGallery3D = closeGallery3D;
})();
