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
    roomIndex: 0,
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
      const mount = new THREE.Mesh(new THREE.PlaneGeometry(1.59, 1.99), new THREE.MeshBasicMaterial({ color: 0xf3f1e9, toneMapped: false }));
      mount.position.z = 0.035;
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), new THREE.MeshBasicMaterial({ color: 0xd9deda, toneMapped: false }));
      canvas.position.z = 0.04;
      frame.add(border, mount, canvas);
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

  function setupScene(container) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8e7e2);
    camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.1, 80);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, state.isMobile ? 1.5 : 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    container.appendChild(renderer.domElement);
    // Sabit üç ışık; eser renkleri ışık/tone mapping etkisinden bağımsızdır.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xaaa79c, 2.2));
    const key = new THREE.DirectionalLight(0xfffaf0, 1.5);
    key.position.set(3, 7, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xf1f5ff, 0.7);
    fill.position.set(-4, 5, -3); scene.add(fill);
  }

  function showRoom(roomIndex) {
    const run = session;
    if (!run || state.inspecting) return;
    const plan = GalleryLayout.plan(state.images.length, roomIndex);
    run.roomController?.abort();
    if (run.room) { scene.remove(run.room); disposeObjects([run.room]); }
    run.roomController = new AbortController();
    state.roomIndex = roomIndex;
    state.roomHalfWidth = plan.width / 2;
    state.roomHalfDepth = plan.depth / 2;
    state.wallHeight = plan.height;
    state.frames = [];
    state.yaw = 0; state.pitch = 0;
    resetControls();
    if (document.pointerLockElement === el('gal3d-canvas-container')) document.exitPointerLock();
    camera.position.set(...plan.spawn);
    camera.rotation.set(0, 0, 0);
    const room = GalleryRoom.create(THREE, plan, run.exhibitionName, run.schoolName);
    run.room = room;
    scene.add(room);
    placeArtworks(room, plan, run);
    setupArtworkPicker(plan);
    el('gal3d-room-select').value = String(roomIndex);
    el('gal3d-room-prev').disabled = roomIndex === 0;
    el('gal3d-room-next').disabled = roomIndex === plan.roomCount - 1;
    el('gal3d-room-status').textContent = (plan.start + 1) + '–' + plan.end + ' / ' + state.images.length + ' eser';
    el('gal3d-room-nav').classList.remove('hidden');
  }

  function onResize(container) {
    if (!renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  /* ─── KONTROLLER ─────────────────────────────────────────── */

  function inspectArtwork(index) {
    if (!state.active || state.inspecting || !state.images[index]) return;
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
    // İlk yüzey seçilir; duvarın/panonun arkasındaki eser tıklanamaz.
    scene.updateMatrixWorld(true);
    const index = ArtworkTools.pickedArtworkIndex(ray.intersectObjects(scene.children, true), state.images);
    if (index < 0) return false;
    inspectArtwork(index);
    return true;
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
      if (movementKeys.has(e.code)) { e.preventDefault(); state.keys[e.code] = true; }
    });
    listen(window, 'keyup', e => { state.keys[e.code] = false; });
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
      if (state.inspecting || state.joystick.active) return;
      joyBase.setPointerCapture(e.pointerId);
      state.joystick.active = true;
      state.joystick.pointerId = e.pointerId;
      state.joystick.startX = e.clientX;
      state.joystick.startY = e.clientY;
    });

    listen(joyBase, 'pointermove', e => {
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
    if (state.inspecting) return;
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
    if (!state.active || !renderer) return;
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

    const run = { controller: new AbortController(), exhibitionName };
    session = run;
    state.active = true;
    state.inspecting = false;
    state.gestureMoved = false;
    resetControls();
    overlay.classList.remove('hidden');
    loading.classList.remove('hidden');
    el('gal3d-artwork-picker').classList.add('hidden');
    el('gal3d-aim').classList.add('hidden');
    el('gal3d-room-nav').classList.add('hidden');
    run.releaseModal = window.activateGalleryModal(overlay);
    listen(window, 'keydown', escListener);
    listen(window, 'blur', resetControls);
    listen(document, 'visibilitychange', () => { if (document.hidden) resetControls(); });

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
      el('gal3d-minimap-wrap').classList.remove('hidden');
      const schoolName = typeof SCHOOL_NAME !== 'undefined' ? SCHOOL_NAME : 'Sanal Sergi';
      const badgeSchool = el('gal3d-badge-school');
      if (badgeSchool) badgeSchool.textContent = schoolName;
      run.schoolName = schoolName;
      el('gal3d-exhibition-name').textContent = exhibitionName;
      el('gal3d-exhibition-name').title = exhibitionName;

      setupScene(container);
      const rooms = GalleryLayout.plan(images.length).roomCount;
      const roomSelect = el('gal3d-room-select');
      roomSelect.replaceChildren();
      for (let i = 0; i < rooms; i++) roomSelect.add(new Option('Salon ' + (i + 1) + ' / ' + rooms, String(i)));
      showRoom(0);
      listen(roomSelect, 'change', () => showRoom(Number(roomSelect.value)));
      listen(el('gal3d-room-prev'), 'click', () => { showRoom(state.roomIndex - 1); roomSelect.focus(); });
      listen(el('gal3d-room-next'), 'click', () => { showRoom(state.roomIndex + 1); roomSelect.focus(); });
      listen(el('gal3d-inspect'), 'click', () => inspectArtwork(Number(el('gal3d-artwork-select').value)));

      if (state.isMobile) {
        setupMobileControls(container);
      } else {
        setupDesktopControls(container);
      }

      listen(window, 'resize', () => onResize(container));

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
    if (e.code === 'Escape' && !state.inspecting) closeGallery3D();
  }

  function closeGallery3D() {
    if (!state.active) return;
    const run = session;
    session = null;
    state.active = false;
    run.controller.abort();
    run.roomController?.abort();
    resetControls();
    cancelAnimationFrame(raf);
    raf = null;

    const container = el('gal3d-canvas-container');
    if (document.pointerLockElement === container) document.exitPointerLock();
    disposeObjects([scene]);
    run.room = null;
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    }
    scene = null; camera = null; renderer = null; clock = null;
    state.frames = [];
    state.images = [];

    el('gal3d-overlay').classList.add('hidden');
    run.releaseModal();
  }

  window.openGallery3D = openGallery3D;
  window.closeGallery3D = closeGallery3D;
})();
