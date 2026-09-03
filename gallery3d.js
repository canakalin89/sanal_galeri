// 3D Sanal Sergi Salonu — Three.js ile procedural müze salonu.
// Yalnızca kullanıcı "3D Salonda Gez" butonuna bastığında yüklenir (lazy).
// Dışa açık API: window.openGallery3D(images, exhibitionName), window.closeGallery3D()

(function () {
  const THREE_URL = '/vendor/three.module.js';

  let THREE = null;
  let renderer, scene, camera, clock;
  let raf = null;
  let session = null;

  function isCurrent(run) { return session === run && !run.controller.signal.aborted; }

  // Aynı geometri/doku klonlarda paylaşılabilir; her kaynağı yalnızca bir kez bırak.
  function disposeObjects(roots) {
    const resources = new Set();
    const bitmaps = new Set();
    for (const root of roots) root?.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.shadow) resources.add(object.shadow);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        resources.add(material);
        for (const value of Object.values(material)) {
          if (!value?.isTexture) continue;
          resources.add(value);
          if (value.image?.close) bitmaps.add(value.image);
        }
      }
    });
    resources.forEach(resource => resource.dispose());
    bitmaps.forEach(bitmap => bitmap.close());
  }

  function listen(target, type, callback, options = {}) {
    target.addEventListener(type, callback, { ...options, signal: session.controller.signal });
  }

  function resetControls() {
    state.keys = {};
    Object.assign(state.joystick, { active: false, dx: 0, dy: 0, pointerId: null });
    Object.assign(state.lookTouch, { active: false, pointerId: null });
    const stick = el('gal3d-joy-stick');
    if (stick) stick.style.transform = 'translate(0,0)';
  }

  const state = {
    active: false,
    inspecting: false,
    gestureMoved: false,
    images: [],
    frames: [],           // { mesh, img, plaqueGroup }
    keys: {},
    yaw: 0,
    pitch: 0,
    isMobile: false,
    joystick: { active: false, startX: 0, startY: 0, dx: 0, dy: 0 },
    lookTouch: { active: false, lastX: 0, lastY: 0 },
    roomHalfWidth: 6,
    roomHalfDepth: 6,
    wallHeight: 5.2,
    partitions: [],
    obstacles: []
  };

  function isMobileDevice() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 820;
  }

  async function loadThree() {
    if (THREE) return THREE;
    THREE = await import(THREE_URL);
    return THREE;
  }

  async function getDecorLoader(run) {
    if (run.loaderPromise) return run.loaderPromise;
    run.loaderPromise = (async () => {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('/vendor/loaders/GLTFLoader.js'),
        import('/vendor/loaders/DRACOLoader.js')
      ]);
      if (!isCurrent(run)) throw new Error('Salon kapatıldı.');
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('/vendor/draco/');
      dracoLoader.setWorkerLimit(state.isMobile ? 1 : 2);
      run.dracoLoader = dracoLoader;
      return new GLTFLoader().setDRACOLoader(dracoLoader);
    })();
    return run.loaderPromise;
  }

  function loadModel(url, run) {
    run.pendingModels = (run.pendingModels || 0) + 1;
    return getDecorLoader(run).then(loader => new Promise((resolve, reject) => {
      loader.load(url, gltf => {
        if (!isCurrent(run)) { disposeObjects([gltf.scene]); reject(new Error('Salon kapatıldı.')); return; }
        resolve(gltf.scene);
      }, undefined, reject);
    })).finally(() => {
      run.pendingModels--;
      if (!isCurrent(run) && run.pendingModels === 0) run.dracoLoader?.dispose();
    });
  }

  function normalizeModel(model, targetSize, axis = 'max') {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); bounds.getSize(size);
    const reference = axis === 'x' ? size.x : axis === 'y' ? size.y : axis === 'z' ? size.z : Math.max(size.x, size.y, size.z);
    model.scale.setScalar(targetSize / (reference || 1));
    const normalized = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3(); normalized.getCenter(center);
    model.position.x -= center.x; model.position.z -= center.z; model.position.y -= normalized.min.y;
    const finalSize = new THREE.Vector3(); normalized.getSize(finalSize);
    return finalSize;
  }

  function replaceFallback(room, kind) {
    const matches = [];
    room.traverse(node => { if (node.userData.decorFallback === kind) matches.push(node); });
    for (const node of matches) { node.parent.remove(node); disposeObjects([node]); }
  }

  function addModelInstances(room, model, placements, kind, targetSize, axis, yForSize) {
    const size = normalizeModel(model, targetSize, axis);
    const holder = new THREE.Group();
    for (const placement of placements) {
      const instance = model.clone(true);
      instance.traverse(node => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) if (material?.isMeshStandardMaterial) material.envMapIntensity = 0.85;
      });
      instance.position.x += placement.x;
      instance.position.z += placement.z;
      instance.position.y += yForSize ? yForSize(size) : 0;
      instance.rotation.y += placement.rotation || 0;
      holder.add(instance);
    }
    replaceFallback(room, kind);
    room.add(holder);
    if (renderer?.shadowMap) renderer.shadowMap.needsUpdate = true;
  }

  function enhanceRoomWithModels(room, plan, run) {
    const current = () => isCurrent(run) && run.room === room;
    loadModel('/vendor/models/plant.glb', run).then(model => {
      if (!current()) { disposeObjects([model]); return; }
      addModelInstances(room, model, plan.decor.plants, 'plant', 1.35, 'y');
    }).catch(() => {});
    loadModel('/vendor/models/chandelier.glb', run).then(model => {
      if (!current()) { disposeObjects([model]); return; }
      addModelInstances(room, model, plan.decor.chandeliers, 'chandelier', 0.95, 'y', size => plan.height - size.y - 0.08);
    }).catch(() => {});
  }

  function el(id) { return document.getElementById(id); }

  function labelTexture(title, subtitle) {
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#edece7'; ctx.fillRect(0, 0, 768, 160);
    ctx.fillStyle = '#303a3c'; ctx.font = '500 32px sans-serif';
    ctx.fillText(title, 24, 60, 720);
    ctx.fillStyle = '#687773'; ctx.font = '25px sans-serif';
    ctx.fillText(subtitle, 24, 113, 720);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function loadImageTexture(url, signal) {
    return new Promise(resolve => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      let settled = false;
      const finish = success => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        image.onload = image.onerror = null;
        if (!success) { image.src = ''; resolve(null); return; }
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        resolve(texture);
      };
      const abort = () => finish(false);
      const timer = setTimeout(abort, 15000);
      signal.addEventListener('abort', abort, { once: true });
      image.onload = () => finish(true);
      image.onerror = abort;
      if (signal.aborted) abort();
      else image.src = url;
    });
  }

  function placeArtworks(room, plan, run) {
    const tasks = [];
    const current = () => isCurrent(run) && run.room === room;
    const signal = run.roomController.signal;
    for (const slot of plan.slots) {
      const img = state.images[slot.index];
      const frame = new THREE.Group();
      frame.position.set(...slot.position);
      frame.lookAt(slot.position[0] + slot.normal[0], slot.position[1], slot.position[2] + slot.normal[2]);
      frame.userData.imgData = img;
      room.add(frame);
      state.frames.push(frame);
      const border = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.05, 0.055), new THREE.MeshStandardMaterial({ color: 0x303638, roughness: 0.8 }));
      border.castShadow = border.receiveShadow = true;
      const mount = new THREE.Mesh(new THREE.PlaneGeometry(1.59, 1.99), new THREE.MeshBasicMaterial({ color: 0xf3f1e9, toneMapped: false }));
      mount.position.z = 0.035;
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), new THREE.MeshBasicMaterial({ color: 0xd9deda, toneMapped: false }));
      canvas.position.z = 0.04;
      frame.add(border, mount, canvas);
      frame.userData.artworkSurface = canvas;
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.24), new THREE.MeshBasicMaterial({
        map: labelTexture(String(slot.index + 1).padStart(2, '0') + '  ' + (img.title || 'Eser ' + (slot.index + 1)), img.artist || 'Bilgi için eseri seçin'), toneMapped: false
      }));
      plaque.position.set(0, -1.23, 0.04);
      frame.add(plaque);
      tasks.push(async () => {
        const width = state.isMobile ? 640 : 1200;
        const texture = await loadImageTexture(img.thumbSrc ? img.thumbSrc.replace(/=w\d+/, '=w' + width) : img.src, signal);
        if (!current()) { texture?.dispose(); return; }
        if (!texture) {
          canvas.material.map = labelTexture('Görsel yüklenemedi', 'İncelemek için seçin');
          canvas.material.color.set(0xffffff);
          canvas.material.needsUpdate = true;
          return;
        }
        const size = GalleryLayout.fitArtwork(texture.image.width, texture.image.height);
        canvas.geometry.dispose(); canvas.geometry = new THREE.PlaneGeometry(size.width, size.height);
        canvas.material.dispose(); canvas.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
        mount.geometry.dispose(); mount.geometry = new THREE.PlaneGeometry(size.width + 0.18, size.height + 0.18);
        border.geometry.dispose(); border.geometry = new THREE.BoxGeometry(size.width + 0.24, size.height + 0.24, 0.055);
        plaque.position.y = -size.height / 2 - 0.28;
      });
    }
    let next = 0;
    async function worker() {
      while (current() && next < tasks.length) await tasks[next++]();
    }
    // Ağ ve GPU yükü, koleksiyonun tamamından bağımsız olarak sınırlandırılır.
    for (let i = 0; i < Math.min(4, tasks.length); i++) worker().catch(() => {});
  }

  async function enhanceNeighborhood(plan, run) {
    const controller = new AbortController(); run.neighborhoodController = controller;
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const [response, utils] = await Promise.all([
        fetch('/assets/environment/kapakli.json', { signal: controller.signal }),
        import('/vendor/utils/BufferGeometryUtils.js')
      ]);
      if (!response.ok) throw new Error('Çevre yüklenemedi.');
      const data = await response.json();
      if (!isCurrent(run)) return;
      GalleryNeighborhood.populate(THREE, run.neighborhood, data, plan, state.isMobile, utils.mergeGeometries);
      el('gal3d-environment-status').textContent = 'Karaağaç / Kapaklı · Yaklaşık 3D çevre';
      updateDayNightCycle(plan, run);
    } catch {
      if (isCurrent(run)) el('gal3d-environment-status').textContent = 'Çevre yüklenemedi; salon kullanılabilir';
    } finally { clearTimeout(timer); }
  }

  function weatherStatus(run, message) {
    const status = el('gal3d-weather-status');
    if (!status) return;
    if (!run.weather) { status.textContent = message || 'Hava verisi alınamadı'; status.title = 'Güncel veri yok; yağış ve fırtına efektleri kapalı.'; return; }
    const report = run.weather, description = GalleryWeather.describe(report);
    const time = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(report.observedAt);
    status.textContent = `${Math.round(report.temperature)}°C · ${description.label} · ${time}`;
    status.title = 'Kapaklı için Open-Meteo model verisi; yerinde ölçüm veya canlı kamera değildir. Veri saati: ' + time;
  }

  async function refreshWeather(run) {
    if (!isCurrent(run) || run.weatherLoading) return;
    run.weatherLoading = true;
    const controller = new AbortController(); run.weatherController = controller;
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/weather', { signal: controller.signal });
      if (!response.ok) throw new Error('Hava verisi alınamadı.');
      const report = GalleryWeather.validate(await response.json());
      if (!isCurrent(run)) return;
      run.weather = report; run.weatherUpdatedAt = Date.now();
      run.atmosphere.setWeather(report); weatherStatus(run);
      updateDayNightCycle(run.plan, run);
    } catch {
      if (!isCurrent(run)) return;
      run.weather = null; run.atmosphere.setWeather(null);
      weatherStatus(run, 'Hava verisi alınamadı · efektler kapalı');
      updateDayNightCycle(run.plan, run);
    } finally { clearTimeout(timer); run.weatherLoading = false; }
  }

  function setupScene(container) {
    const run = session;
    const plan = GalleryLayout.plan(state.images.length);
    run.plan = plan;
    run.quality = GalleryLighting.profile({
      isMobile: state.isMobile,
      devicePixelRatio: window.devicePixelRatio,
      width: plan.width,
      depth: plan.depth
    });
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdedfdc);
    scene.fog = new THREE.Fog(0xbbcbd2, 80, 1150);
    camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.1, Math.max(1600, Math.hypot(plan.width, plan.depth) * 1.25));
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(run.quality.pixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = state.isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    container.appendChild(renderer.domElement);

    // Notr bir galeri ortam haritasi, metal/cam dekorlarda gercekci yansima verir.
    const environmentScene = new THREE.Scene();
    environmentScene.background = new THREE.Color(0xcfd3d0);
    const environmentMaterial = new THREE.MeshBasicMaterial({ color: 0xf7f0df, side: THREE.DoubleSide });
    for (const [x, y, z, rx, ry] of [[0, 4, -5, 0, 0], [-5, 2, 0, 0, Math.PI / 2], [5, 3, 2, 0, -Math.PI / 2]]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), environmentMaterial);
      panel.position.set(x, y, z); panel.rotation.set(rx, ry, 0); environmentScene.add(panel);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    run.environmentTarget = pmrem.fromScene(environmentScene, 0.02);
    scene.environment = run.environmentTarget.texture;
    disposeObjects([environmentScene]);
    pmrem.dispose();
    // Mobil tarayıcı GPU belleğini geçici olarak bırakırsa sahneyi sessizce durdurup geri getir.
    listen(renderer.domElement, 'webglcontextlost', event => {
      event.preventDefault();
      cancelAnimationFrame(raf);
      raf = null;
      resetControls();
      run.game?.setPaused(true);
      const loading = el('gal3d-loading');
      loading.querySelector('p').textContent = '3D görünüm yeniden hazırlanıyor…';
      loading.classList.remove('hidden');
    });
    listen(renderer.domElement, 'webglcontextrestored', () => {
      if (!state.active || raf) return;
      const loading = el('gal3d-loading');
      loading.querySelector('p').textContent = 'Salon hazırlanıyor…';
      loading.classList.add('hidden');
      renderer.shadowMap.needsUpdate = true;
      clock.start();
      run.game?.setPaused(document.hidden);
      animate();
    });
  }

  function selectEvenly(items, count) {
    if (count <= 0 || items.length === 0) return [];
    if (count === 1) return [items[Math.floor(items.length / 2)]];
    if (items.length <= count) return items;
    return Array.from({ length: count }, (_, index) => items[Math.round(index * (items.length - 1) / (count - 1))]);
  }

  function configureLighting(plan, run) {
    if (run.lights) { scene.remove(run.lights); disposeObjects([run.lights]); }
    clearInterval(run.dayCycleTimer);
    const lights = new THREE.Group();
    run.lights = lights;
    const hemisphere = new THREE.HemisphereLight(0xf8fbff, 0x77736b, 0.6);
    lights.add(hemisphere);

    const extent = run.quality.shadowExtent;
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
    sun.target.position.set(0, 0.15, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(run.quality.shadowMapSize, run.quality.shadowMapSize);
    Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: extent * 2.4 + plan.height });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = run.quality.shadowRadius;
    lights.add(sun, sun.target);

    const fill = new THREE.DirectionalLight(0xdceaff, 0.32);
    fill.position.set(-plan.width * 0.35, plan.height * 0.72, -plan.depth * 0.28);
    lights.add(fill);

    const ceilingLights = [];
    const ceilingPositions = selectEvenly(plan.decor.chandeliers, run.quality.ceilingLightCount);
    ceilingPositions.forEach((placement, index) => {
      const ceilingLight = new THREE.SpotLight(0xffe8c4, state.isMobile ? 22 : 30, 7.5, 0.78, 0.82, 2);
      const rafters = GalleryRoof.layout(plan).rafters;
      const desiredZ = ceilingPositions.length === 1 ? 0 : (index % 2 ? -plan.depth * 0.22 : plan.depth * 0.22);
      const z = rafters.reduce((best, value) => Math.abs(value - desiredZ) < Math.abs(best - desiredZ) ? value : best, 0);
      ceilingLight.position.set(placement.x, plan.height - 0.1, z);
      ceilingLight.target.position.set(placement.x, 0, z);
      lights.add(ceilingLight, ceilingLight.target);
      ceilingLights.push(ceilingLight);
      // Spot gövdesi camın önünde boşlukta kalmaz; alt kirişe sabitlenir.
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x354345, roughness: 0.55 }));
      housing.position.copy(ceilingLight.position); lights.add(housing);
    });

    const lamps = [];
    selectEvenly(plan.decor.chandeliers, run.quality.pointLightCount).forEach(placement => {
      const lamp = new THREE.PointLight(0xffd9a0, state.isMobile ? 8 : 11, 5.5, 2);
      lamp.position.set(placement.x, plan.height - 0.8, placement.z);
      lights.add(lamp);
      lamps.push(lamp);
    });
    scene.add(lights);
    run.dayNightLights = { hemisphere, sun, fill, ceilingLights, lamps };
    updateDayNightCycle(plan, run);
    run.dayCycleTimer = setInterval(() => {
      if (isCurrent(run)) updateDayNightCycle(plan, run);
    }, 60000);
  }

  function updateDayNightCycle(plan, run) {
    if (run.weather) {
      try { GalleryWeather.validate(run.weather); }
      catch { run.weather = null; run.atmosphere?.setWeather(null); weatherStatus(run, 'Hava verisi eskidi · efektler kapalı'); }
    }
    const conditions = run.weather ? GalleryWeather.describe(run.weather) : null;
    const cycle = GalleryLighting.dayCycle(new Date(), run.weather?.sun || []);
    const { hemisphere, sun, fill, ceilingLights, lamps } = run.dayNightLights;
    hemisphere.intensity = cycle.hemisphereIntensity * (1 - (conditions?.cloud || 0) * 0.2);
    hemisphere.color.set(0xbfdcff).lerp(new THREE.Color(0xf8fbff), cycle.daylight);
    hemisphere.groundColor.set(0x242a31).lerp(new THREE.Color(0x77736b), cycle.daylight);
    sun.intensity = cycle.sunIntensity * (1 - (conditions?.cloud || 0) * 0.86);
    sun.color.set(0xffa35c).lerp(new THREE.Color(0xfff4df), cycle.sunHeight);
    sun.position.set(cycle.sunX * run.quality.shadowExtent * 0.82, plan.height + cycle.sunHeight * run.quality.shadowExtent, plan.depth / 2 + run.quality.shadowExtent * 0.62);
    fill.intensity = 0.08 + cycle.daylight * 0.24;
    ceilingLights.forEach(light => { light.intensity = (state.isMobile ? 22 : 30) * cycle.interiorFactor; });
    lamps.forEach(light => { light.intensity = (state.isMobile ? 8 : 11) * cycle.interiorFactor; });

    const nightBackground = new THREE.Color(0x07111e);
    const dayBackground = new THREE.Color(0xdedfdc);
    scene.background.copy(nightBackground).lerp(dayBackground, cycle.daylight);
    if (cycle.dusk > 0.15) scene.background.lerp(new THREE.Color(0xc97855), cycle.dusk * 0.28);
    scene.fog.color.set(0x15202d).lerp(new THREE.Color(conditions?.rain || conditions?.fog ? 0x9ca7aa : 0xbbcbd2), cycle.daylight);
    scene.fog.far = Math.max(100, Math.min(1150, run.weather?.visibility ?? 1150));
    scene.fog.near = Math.min(80, scene.fog.far * 0.35);
    renderer.toneMappingExposure = 1.02 - cycle.daylight * 0.06;

    const dayNight = run.room?.userData.dayNight;
    if (dayNight) {
      dayNight.glassMaterial.opacity = 0.14 - cycle.daylight * 0.06;
      dayNight.roofGlassMaterial.opacity = 0.2 - cycle.daylight * 0.08;
      dayNight.roofGlassMaterial.roughness = conditions?.rain ? 0.22 : 0.1;
    }
    if (run.neighborhood) GalleryNeighborhood.update(THREE, run.neighborhood, cycle, sun.position, conditions);
    const exhibitionBadge = el('gal3d-exhibition-name');
    if (exhibitionBadge) {
      exhibitionBadge.textContent = `${run.exhibitionName} · ${cycle.label} ${cycle.time}`;
      exhibitionBadge.title = `Okulun saati (Europe/Istanbul): ${cycle.time}`;
    }
    renderer.shadowMap.needsUpdate = true;
  }

  function tuneRoomMaterials(room) {
    const anisotropy = Math.min(state.isMobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
    room.traverse(node => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) continue;
        if (material.isMeshStandardMaterial) material.envMapIntensity = 0.55;
        for (const value of Object.values(material)) if (value?.isTexture) value.anisotropy = anisotropy;
      }
    });
  }

  function showRoom() {
    const run = session;
    if (!run || state.inspecting) return;
    const plan = run.plan || GalleryLayout.plan(state.images.length);
    run.roomController?.abort();
    if (run.room) { scene.remove(run.room); disposeObjects([run.room]); }
    run.roomController = new AbortController();
    state.roomHalfWidth = plan.width / 2;
    state.roomHalfDepth = plan.depth / 2;
    state.wallHeight = plan.height;
    state.partitions = plan.partitions;
    state.obstacles = plan.obstacles;
    state.frames = [];
    state.yaw = 0; state.pitch = 0;
    resetControls();
    if (document.pointerLockElement === el('gal3d-canvas-container')) document.exitPointerLock();
    camera.position.set(...plan.spawn);
    camera.rotation.set(0, 0, 0);
    const room = GalleryRoom.create(THREE, plan, run.exhibitionName, run.schoolName);
    run.room = room;
    scene.add(room);
    run.neighborhood = GalleryNeighborhood.create(THREE, plan);
    scene.add(run.neighborhood);
    run.atmosphere = GalleryAtmosphere.create(THREE, scene, plan, state.isMobile);
    tuneRoomMaterials(room);
    configureLighting(plan, run);
    enhanceRoomWithModels(room, plan, run);
    placeArtworks(room, plan, run);
    loadImageTexture('/assets/logo.png', run.roomController.signal).then(texture => {
      if (!texture) return;
      if (!isCurrent(run) || run.room !== room) { texture.dispose(); return; }
      const material = room.userData.entranceLogo.material;
      material.map = texture; material.opacity = 1; material.needsUpdate = true;
    });
    run.game = GalleryGame.create(THREE, {
      scene, camera, plan, frames: state.frames, mobile: state.isMobile,
      onShadowChange: () => { if (renderer) renderer.shadowMap.needsUpdate = true; },
      onModeChange: mode => {
        resetControls();
        el('gal3d-aim').classList.toggle('hidden', mode === 'idle' && state.isMobile);
        if (mode === 'ended' || mode === 'idle') {
          if (document.pointerLockElement === el('gal3d-canvas-container')) document.exitPointerLock();
        }
        if (mode === 'countdown') el('gal3d-overlay').focus();
        if (mode === 'ended') el('gal3d-game-exit').focus();
      }
    });
    enhanceNeighborhood(plan, run);
    refreshWeather(run);
    run.weatherTimer = setInterval(() => { if (!document.hidden) refreshWeather(run); }, GalleryWeather.REFRESH_MS);
    renderer.shadowMap.needsUpdate = true;
    setupArtworkPicker(plan);
  }

  function onResize(container) {
    if (!renderer || !camera) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(session?.quality?.pixelRatio || 1);
    renderer.setSize(width, height);
  }

  /* ─── KONTROLLER ─────────────────────────────────────────── */

  function inspectArtwork(index) {
    if (!state.active || state.inspecting || !state.images[index] || session.game?.mode() !== 'idle') return;
    const run = session;
    state.inspecting = true;
    resetControls();
    if (document.pointerLockElement === el('gal3d-canvas-container')) document.exitPointerLock();
    window.showGalleryArtwork(state.images, index, run.exhibitionName, () => {
      if (isCurrent(run)) { state.inspecting = false; resetControls(); }
    });
  }

  function pickArtwork(event) {
    if (state.inspecting || state.gestureMoved || !camera) return false;
    const container = el('gal3d-canvas-container');
    const bounds = container.getBoundingClientRect();
    const pointer = document.pointerLockElement === container ? new THREE.Vector2(0, 0)
      : new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, camera);
    if (session.game?.mode() !== 'idle') { session.game?.fire(ray.ray.direction); return true; }
    // İlk yüzey seçilir; duvarın/panonun arkasındaki eser tıklanamaz.
    scene.updateMatrixWorld(true);
    const hits = ray.intersectObjects(scene.children, true);
    if (hits[0]?.object.userData.secretLogo) { tapSecretLogo(); return true; }
    const index = ArtworkTools.pickedArtworkIndex(hits, state.images);
    if (index < 0) return false;
    inspectArtwork(index);
    return true;
  }

  function tapSecretLogo() {
    if (state.inspecting || !session?.game) return;
    const started = session.game.tapLogo();
    if (started && !state.isMobile) {
      try { el('gal3d-canvas-container').requestPointerLock?.()?.catch(() => {}); } catch {}
    }
  }

  function setupArtworkPicker(plan) {
    const select = el('gal3d-artwork-select');
    select.replaceChildren();
    state.images.slice(plan.start, plan.end).forEach((image, localIndex) => {
      const index = plan.start + localIndex;
      select.add(new Option((index + 1) + '. ' + (image.title || image.artist || 'Eser ' + (index + 1)), String(index)));
    });
    el('gal3d-artwork-picker').classList.remove('hidden');
    el('gal3d-aim').classList.toggle('hidden', state.isMobile);
  }

  function setupDesktopControls(container) {
    const run = session;
    listen(container, 'click', event => {
      if (state.gestureMoved || state.inspecting || pickArtwork(event)) return;
      try {
        container.requestPointerLock?.()?.catch(() => {
          if (isCurrent(run)) el('gal3d-hint').textContent = 'Fare kilidi kullanılamıyor. Bakmak için sürükleyin; yürümek için WASD / ok tuşlarını kullanın.';
        });
      } catch { /* Gömülü tarayıcılarda sürükleyerek bakış kullanılabilir. */ }
    });

    listen(document, 'mousemove', e => {
      if (state.inspecting || document.pointerLockElement !== container) return;
      state.yaw -= e.movementX * 0.0022;
      state.pitch -= e.movementY * 0.0022;
      state.pitch = Math.max(-1.2, Math.min(1.2, state.pitch));
    });

    const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    listen(window, 'keydown', e => {
      if (state.inspecting || e.target.matches('input, select, textarea')) return;
      if (e.code === 'Space' && run.game?.mode() === 'playing' && !e.target.matches('button')) {
        e.preventDefault(); run.game.fire(); run.game.setFiring(true); return;
      }
      if (movementKeys.has(e.code)) { e.preventDefault(); state.keys[e.code] = true; }
    });
    listen(window, 'keyup', e => { state.keys[e.code] = false; if (e.code === 'Space') run.game?.setFiring(false); });
    listen(container, 'pointerdown', e => { if (e.button === 0 && run.game?.mode() === 'playing') run.game.setFiring(true); });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(container, event, () => run.game?.setFiring(false));
    listen(document, 'pointerlockchange', () => {
      if (document.pointerLockElement !== container) resetControls();
    });
    setupLookControls(container);
  }

  function setupMobileControls(container) {
    const joyBase = el('gal3d-joy-base');
    const joyStick = el('gal3d-joy-stick');
    if (!joyBase) return;

    listen(joyBase, 'pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      if (state.inspecting || state.joystick.active) return;
      joyBase.setPointerCapture(e.pointerId);
      state.joystick.active = true;
      state.joystick.pointerId = e.pointerId;
      state.joystick.startX = e.clientX;
      state.joystick.startY = e.clientY;
    });

    listen(joyBase, 'pointermove', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!state.joystick.active || e.pointerId !== state.joystick.pointerId) return;
      let dx = e.clientX - state.joystick.startX;
      let dy = e.clientY - state.joystick.startY;
      const max = 40;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      state.joystick.dx = dx / max;
      state.joystick.dy = dy / max;
      joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
    });

    function resetJoystick(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerId !== state.joystick.pointerId) return;
      state.joystick.active = false;
      state.joystick.pointerId = null;
      state.joystick.dx = 0;
      state.joystick.dy = 0;
      joyStick.style.transform = 'translate(0,0)';
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(joyBase, type, resetJoystick);
    setupLookControls(container);
    listen(container, 'click', pickArtwork);
  }

  function setupLookControls(container) {
    // Her parmak kendi pointerId değeriyle takip edilir; joystick ile karışmaz.
    listen(container, 'pointerdown', e => {
      state.gestureMoved = false;
      if (state.inspecting || state.lookTouch.active || document.pointerLockElement === container) return;
      container.setPointerCapture(e.pointerId);
      state.lookTouch.active = true;
      state.lookTouch.pointerId = e.pointerId;
      state.lookTouch.lastX = e.clientX;
      state.lookTouch.lastY = e.clientY;
      state.lookTouch.startX = e.clientX;
      state.lookTouch.startY = e.clientY;
    });

    listen(container, 'pointermove', e => {
      if (state.inspecting || !state.lookTouch.active || e.pointerId !== state.lookTouch.pointerId || document.pointerLockElement === container) return;
      if (Math.hypot(e.clientX - state.lookTouch.startX, e.clientY - state.lookTouch.startY) > 6) state.gestureMoved = true;
      const dx = e.clientX - state.lookTouch.lastX;
      const dy = e.clientY - state.lookTouch.lastY;
      state.yaw -= dx * 0.0035;
      state.pitch -= dy * 0.0035;
      state.pitch = Math.max(-1.2, Math.min(1.2, state.pitch));
      state.lookTouch.lastX = e.clientX;
      state.lookTouch.lastY = e.clientY;
    });

    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(container, type, e => {
      if (e.pointerId === state.lookTouch.pointerId) {
        state.lookTouch.active = false;
        state.lookTouch.pointerId = null;
      }
    });
  }

  /* ─── HAREKET ────────────────────────────────────────────── */

  function updateMovement(dt) {
    if (state.inspecting || ['countdown', 'ended'].includes(session?.game?.mode()) || document.hidden) return;
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
      if (delta.lengthSq() > 1) delta.normalize();
      const margin = 0.6;
      const dx = delta.x * speed * dt, dz = delta.z * speed * dt;
      const collides = (x, z) => state.partitions.some(partition =>
        Math.abs(x - partition.x) < 0.58 && Math.abs(z - partition.z) < partition.length / 2 + 0.48
      ) || state.obstacles.some(obstacle => obstacle.type === 'box'
        ? Math.abs(x - obstacle.x) < obstacle.halfX + 0.38 && Math.abs(z - obstacle.z) < obstacle.halfZ + 0.38
        : Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + 0.38
      );
      const nextX = Math.max(-state.roomHalfWidth + margin, Math.min(state.roomHalfWidth - margin, camera.position.x + dx));
      if (!collides(nextX, camera.position.z)) camera.position.x = nextX;
      const nextZ = Math.max(-state.roomHalfDepth + margin, Math.min(state.roomHalfDepth - margin, camera.position.z + dz));
      if (!collides(camera.position.x, nextZ)) camera.position.z = nextZ;
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
    if (!state.active || !renderer) return;
    raf = requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());
    updateMovement(dt);
    session.game?.tick(dt);
    session.atmosphere?.tick(dt);
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

    const run = { controller: new AbortController(), exhibitionName, pendingModels: 0 };
    session = run;
    state.active = true;
    state.inspecting = false;
    state.gestureMoved = false;
    resetControls();
    overlay.classList.remove('hidden');
    loading.classList.remove('hidden');
    el('gal3d-weather-status').textContent = 'Hava durumu yükleniyor…';
    el('gal3d-weather-status').title = '';
    el('gal3d-environment-status').textContent = 'Karaağaç çevresi yükleniyor…';
    el('gal3d-artwork-picker').classList.add('hidden');
    el('gal3d-aim').classList.add('hidden');
    run.releaseModal = window.activateGalleryModal(overlay);
    listen(window, 'keydown', escListener);
    listen(window, 'blur', () => { resetControls(); run.game?.setPaused(true); });
    listen(window, 'focus', () => run.game?.setPaused(document.hidden));
    listen(document, 'visibilitychange', () => {
      if (document.hidden) resetControls();
      run.atmosphere?.setVisible(!document.hidden);
      run.game?.setPaused(document.hidden);
      if (!document.hidden && run.atmosphere && Date.now() - (run.weatherUpdatedAt || 0) > GalleryWeather.REFRESH_MS) refreshWeather(run);
    });

    try {
      await loadThree();
      if (!isCurrent(run)) return;

      state.images = images;
      state.frames = [];
      state.yaw = 0;
      state.pitch = 0;
      state.keys = {};
      state.isMobile = isMobileDevice();

      el('gal3d-joystick').classList.toggle('hidden', !state.isMobile);
      // Kontrol ipucu artık kalıcı bir HUD — otomatik kaybolmuyor
      el('gal3d-hint').innerHTML = state.isMobile
        ? '<strong>Yürü:</strong> Sol çubuk &nbsp; <strong>Bak:</strong> Sürükle &nbsp; <strong>Eser:</strong> Dokun'
        : '<strong>Yürü:</strong> WASD / Ok tuşları &nbsp; <strong>Bak:</strong> Fare / Sürükle &nbsp; <strong>Eser:</strong> Tıkla &nbsp; <strong>Çık:</strong> ESC';
      el('gal3d-hint').classList.remove('hidden');
      el('gal3d-minimap-wrap').classList.toggle('hidden', state.isMobile);
      const schoolName = typeof SCHOOL_NAME !== 'undefined' ? SCHOOL_NAME : 'Sanal Sergi';
      const badgeSchool = el('gal3d-badge-school');
      if (badgeSchool) badgeSchool.textContent = schoolName;
      run.schoolName = schoolName;
      el('gal3d-exhibition-name').textContent = exhibitionName;
      el('gal3d-exhibition-name').title = exhibitionName;

      setupScene(container);
      showRoom();
      listen(el('gal3d-school-seal'), 'click', tapSecretLogo);
      listen(el('gal3d-game-exit'), 'click', () => run.game.exit());
      const fireButton = el('gal3d-game-fire');
      listen(fireButton, 'pointerdown', event => {
        event.preventDefault(); fireButton.setPointerCapture(event.pointerId); run.game.fire(); run.game.setFiring(true);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(fireButton, type, () => run.game.setFiring(false));
      const sound = el('gal3d-weather-sound');
      sound.setAttribute('aria-pressed', 'false'); sound.textContent = 'Ses kapalı';
      listen(sound, 'click', async () => {
        sound.disabled = true;
        const enabled = await run.atmosphere.setSound(sound.getAttribute('aria-pressed') !== 'true');
        sound.disabled = false;
        if (!isCurrent(run)) return;
        sound.setAttribute('aria-pressed', String(enabled)); sound.textContent = enabled ? 'Ses açık' : 'Ses kapalı';
      });
      listen(el('gal3d-inspect'), 'click', () => inspectArtwork(Number(el('gal3d-artwork-select').value)));

      if (state.isMobile) {
        setupMobileControls(container);
      } else {
        setupDesktopControls(container);
      }

      listen(window, 'resize', () => onResize(container));
      if (window.visualViewport) listen(window.visualViewport, 'resize', () => onResize(container));
      if (typeof ResizeObserver !== 'undefined') {
        run.resizeObserver = new ResizeObserver(() => onResize(container));
        run.resizeObserver.observe(container);
      }

      clock = new THREE.Clock();
      loading.classList.add('hidden');
      animate();
    } catch (error) {
      if (!isCurrent(run)) return;
      closeGallery3D();
      throw error;
    }
  }

  function escListener(e) {
    if (e.code !== 'Escape' || state.inspecting) return;
    if (session?.game?.mode() !== 'idle') { session.game.exit(); return; }
    closeGallery3D();
  }

  function closeGallery3D() {
    if (!state.active) return;
    const run = session;
    session = null;
    state.active = false;
    run.controller.abort();
    run.roomController?.abort();
    clearInterval(run.dayCycleTimer);
    clearInterval(run.weatherTimer);
    run.weatherController?.abort();
    run.neighborhoodController?.abort();
    run.atmosphere?.dispose();
    run.game?.dispose();
    run.resizeObserver?.disconnect();
    resetControls();
    cancelAnimationFrame(raf);
    raf = null;

    const container = el('gal3d-canvas-container');
    if (document.pointerLockElement === container) document.exitPointerLock();
    disposeObjects([scene]);
    run.environmentTarget?.dispose();
    run.room = null;
    if (run.pendingModels === 0) run.dracoLoader?.dispose();
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    }
    scene = null; camera = null; renderer = null; clock = null;
    state.frames = [];
    state.images = [];
    state.partitions = [];
    state.obstacles = [];

    el('gal3d-overlay').classList.add('hidden');
    run.releaseModal();
  }

  window.openGallery3D = openGallery3D;
  window.closeGallery3D = closeGallery3D;
})();
