// 3D Sanal Sergi Salonu — Three.js ile procedural müze salonu.
// Yalnızca kullanıcı "3D Salonda Gez" butonuna bastığında yüklenir (lazy).
// Dışa açık API: window.openGallery3D(images, exhibitionName), window.closeGallery3D()

(function () {
  const THREE_URL = '/vendor/three.module.js';

  let THREE = null;
  let renderer, scene, camera, clock;
  let animationId = null;
  let raf = null;

  const state = {
    active: false,
    images: [],
    frames: [],           // { mesh, img, plaqueGroup }
    walkTarget: null,      // eser durağı animasyonu için hedef pozisyon/yön
    focusFrame: null,
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
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f0ede2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    ctx.fillStyle = '#1a1711';
    ctx.font = '600 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(truncateText(ctx, title || 'İsimsiz Eser', canvas.width - 40), canvas.width / 2, 56);
    if (sub) {
      ctx.font = 'italic 24px Georgia, serif';
      ctx.fillStyle = '#6b6358';
      ctx.fillText(truncateText(ctx, sub, canvas.width - 40), canvas.width / 2, 96);
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

  /* ─── SALON ÜRETİMİ ──────────────────────────────────────── */

  function buildRoom(count) {
    const perWallEstimate = Math.max(1, Math.ceil(count / 4));
    const wallLen = Math.max(10, perWallEstimate * 3.4 + 2);
    state.roomHalfWidth = wallLen / 2;
    state.roomHalfDepth = wallLen / 2;

    const group = new THREE.Group();

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d2036, roughness: 0.9, metalness: 0.05 });
    const floorTex = makeFloorTexture();
    floorTex.repeat.set(wallLen / 2, wallLen / 2);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x070f1a, roughness: 1 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(wallLen, wallLen), floorMat);
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(wallLen, wallLen), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = state.wallHeight;
    group.add(ceiling);

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

    // Zemin ayracı — altın şerit
    const stripeGeo = new THREE.BoxGeometry(wallLen - 0.4, 0.02, 0.08);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.4, metalness: 0.6 });
    [-state.roomHalfDepth + 0.5, state.roomHalfDepth - 0.5].forEach(z => {
      const s = new THREE.Mesh(stripeGeo, stripeMat);
      s.position.set(0, 0.01, z);
      group.add(s);
    });

    return group;
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
        const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex });
        const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), plaqueMat);
        plaque.position.set(0, -1.35, 0.05);
        frameGroup.add(plaque);

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
          plaque.position.y = -(h / 2) - 0.3;
        });
      }
    }
  }

  /* ─── SAHNE KURULUMU ─────────────────────────────────────── */

  function setupScene(container) {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x070f1a, 8, 22);

    camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.65, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff4e0, 0.7);
    dir.position.set(4, 8, 4);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xcfe8ff, 0.35);
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
      if (!state.focusFrame) container.requestPointerLock?.();
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

  /* ─── HAREKET / RAYCAST ─────────────────────────────────── */

  function updateMovement(dt) {
    if (state.focusFrame) return; // odaklanmışken serbest hareket yok

    const speed = 3.2;
    let moveX = 0, moveZ = 0;

    if (state.isMobile) {
      moveX = state.joystick.dx;
      moveZ = state.joystick.dy;
    } else {
      if (state.keys['KeyW'] || state.keys['ArrowUp'])    moveZ -= 1;
      if (state.keys['KeyS'] || state.keys['ArrowDown'])  moveZ += 1;
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

  function updateFocusAnimation(dt) {
    if (!state.walkTarget) return;
    const t = state.walkTarget;
    camera.position.lerp(t.pos, Math.min(1, dt * 3.5));
    const dist = camera.position.distanceTo(t.pos);
    if (dist < 0.05) {
      camera.position.copy(t.pos);
      state.walkTarget = null;
      showArtworkCard(state.focusFrame.userData.imgData);
    }
    // Bakış yönünü hedefe çevir
    const lookDir = t.lookAt.clone().sub(camera.position).normalize();
    const targetYaw = Math.atan2(lookDir.x, lookDir.z);
    state.yaw += (angleDiff(targetYaw, state.yaw)) * Math.min(1, dt * 4);
    state.pitch += (0 - state.pitch) * Math.min(1, dt * 4);
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function focusOnFrame(frame) {
    state.focusFrame = frame;
    const normal = frame.userData.normal.clone();
    const targetPos = frame.position.clone().addScaledVector(normal, 2.2);
    targetPos.y = 1.65;
    state.walkTarget = { pos: targetPos, lookAt: frame.position.clone() };
    hideArtworkCard();
  }

  function exitFocus() {
    state.focusFrame = null;
    state.walkTarget = null;
    hideArtworkCard();
  }

  function raycastClick(container, clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const meshes = state.frames.map(f => f.userData.canvasMesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const frame = state.frames.find(f => f.userData.canvasMesh === hits[0].object);
      if (frame) focusOnFrame(frame);
    }
  }

  /* ─── ESER BİLGİ KARTI ───────────────────────────────────── */

  function showArtworkCard(img) {
    const card = el('gal3d-card');
    if (!card) return;
    el('gal3d-card-title').textContent = img.title || '';
    el('gal3d-card-caption').textContent = img.caption || '';
    el('gal3d-card-artist').textContent = img.artist || '';
    card.classList.remove('hidden');
  }

  function hideArtworkCard() {
    el('gal3d-card')?.classList.add('hidden');
  }

  /* ─── ANİMASYON DÖNGÜSÜ ──────────────────────────────────── */

  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());
    updateFocusAnimation(dt);
    updateMovement(dt);
    renderer.render(scene, camera);
  }

  /* ─── AÇILIŞ / KAPANIŞ ───────────────────────────────────── */

  async function openGallery3D(images, exhibitionName) {
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
    state.focusFrame = null;
    state.walkTarget = null;
    state.isMobile = isMobileDevice();

    el('gal3d-joystick').classList.toggle('hidden', !state.isMobile);
    el('gal3d-hint').textContent = state.isMobile
      ? 'Sol alttaki çubukla yürü, ekranı sürükleyerek bak. Bir esere dokun.'
      : 'Tıkla, WASD veya ok tuşlarıyla yürü, fareyle bak. Bir esere tıkla. Çıkmak için ESC.';
    el('gal3d-hint').classList.remove('hidden');
    clearTimeout(openGallery3D._hintTimer);
    openGallery3D._hintTimer = setTimeout(() => el('gal3d-hint')?.classList.add('hidden'), 5000);

    setupScene(container);
    const room = buildRoom(images.length);
    scene.add(room);
    await placeArtworks(room, images);

    if (state.isMobile) {
      setupMobileControls(container);
    } else {
      setupDesktopControls(container);
    }

    container.addEventListener('click', e => {
      if (state.isMobile) return;
      if (document.pointerLockElement === container) raycastClick(container, window.innerWidth / 2, window.innerHeight / 2);
    });

    container.addEventListener('touchend', e => {
      if (!state.isMobile) return;
      if (state.lookTouch.active === false && e.changedTouches.length) {
        // basit tap algısı: sürükleme olmadıysa tıklama say
      }
    });
    // Mobilde eser seçimi: kısa dokunuşta merkez raycast
    let touchStartTime = 0, touchMoved = false;
    container.addEventListener('touchstart', () => { touchStartTime = Date.now(); touchMoved = false; }, { passive: true });
    container.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
    container.addEventListener('touchend', e => {
      if (!state.isMobile || touchMoved || Date.now() - touchStartTime > 300) return;
      const t = e.changedTouches[0];
      if (el('gal3d-joy-base').contains(t.target)) return;
      raycastClick(container, t.clientX, t.clientY);
    });

    window.addEventListener('resize', () => onResize(container));
    window.addEventListener('keydown', escListener);

    clock = new THREE.Clock();
    loading.classList.add('hidden');
    animate();
  }

  function escListener(e) {
    if (e.code === 'Escape') {
      if (state.focusFrame) {
        exitFocus();
      } else {
        closeGallery3D();
      }
    }
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
    hideArtworkCard();

    el('gal3d-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  window.openGallery3D = openGallery3D;
  window.closeGallery3D = closeGallery3D;
  window.gallery3DExitFocus = exitFocus;
})();
