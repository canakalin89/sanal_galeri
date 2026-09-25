// Okulun resmî konumundaki OSM geometrileri; cephe ve eksik yükseklikler temsildir.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryNeighborhood = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SITE = { latitude: 41.3107562, longitude: 27.9523363, timezone: 'Europe/Istanbul' };
  const GROUND_Y = -4.2;

  function bounds(points) {
    const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }

  function selectFeatures(data, plan, mobile) {
    if (data?.version !== 1 || !Array.isArray(data.features) || data.features.length > 2000) throw new Error('Çevre verisi doğrulanamadı.');
    const valid = data.features.filter(feature => feature.tags && Array.isArray(feature.points) && feature.points.length >= 2 &&
      feature.points.length <= 4000 && feature.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) < 30000)));
    const distance = feature => {
      const b = bounds(feature.points);
      return Math.hypot((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
    };
    const buildings = valid.filter(feature => {
      if (!feature.tags.building || feature.points.length < 4) return false;
      const b = bounds(feature.points);
      // Sanal salonun içine gerçek okul binası veya komşu bir bina çizilmez.
      const overlap = b.minX < plan.width / 2 + 2 && b.maxX > -plan.width / 2 - 2 && b.minZ < plan.depth / 2 + 2 && b.maxZ > -plan.depth / 2 - 2;
      return !overlap && distance(feature) < 1150;
    }).sort((a, b) => distance(a) - distance(b)).slice(0, mobile ? 180 : 280);
    return {
      buildings,
      roads: valid.filter(feature => feature.tags.highway && !['proposed', 'construction'].includes(feature.tags.highway)),
      areas: valid.filter(feature => !feature.tags.building && !feature.tags.highway && feature.points.length >= 4),
      trees: (data.trees || []).filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).slice(0, 64)
    };
  }

  function buildingHeight(feature) {
    const explicit = Number.parseFloat(feature.tags.height);
    if (explicit > 0 && explicit < 100) return explicit;
    const levels = Number(feature.tags['building:levels']);
    if (levels > 0 && levels < 30) return levels * 3.1;
    return feature.tags.building === 'industrial' ? 8 : feature.tags.building === 'service' ? 3 : feature.tags.building === 'school' ? 12.4 : 6.2;
  }

  function trafficRoutes(roads, plan, mobile) {
    const clearance = Math.max(plan.width, plan.depth) / 2 + 4;
    const roadways = roads.filter(road => !['track', 'path', 'footway', 'pedestrian', 'steps', 'cycleway'].includes(road.tags.highway));
    const nodes = new Map(), key = point => point.join(',');
    const node = point => {
      const id = key(point);
      if (!nodes.has(id)) nodes.set(id, { id, point, next: [] });
      return nodes.get(id);
    };
    for (const road of roadways) for (let i = 1; i < road.points.length; i++) {
      const a = node(road.points[i - 1]), b = node(road.points[i]);
      if (a.id !== b.id && Math.hypot(...a.point) > clearance && Math.hypot(...b.point) > clearance) {
        if (!a.next.includes(b)) a.next.push(b);
        if (!b.next.includes(a)) b.next.push(a);
      }
    }
    const seeds = roadways.map(road => ({
      points: road.points,
      distance: Math.min(...road.points.map(point => Math.hypot(...point))),
      length: road.points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - road.points[i][0], point[1] - road.points[i][1]), 0)
    })).filter(road => road.distance > clearance && road.distance < 260 && road.length > 55)
      .sort((a, b) => a.distance - b.distance);
    const extend = (anchor, first) => {
      const path = [anchor.point], seen = new Set([anchor.id]);
      let previous = anchor, current = first;
      for (let step = 0; step < 80; step++) {
        if (seen.has(current.id)) return null;
        seen.add(current.id); path.push(current.point);
        if (Math.hypot(...current.point) > 260) return path;
        const dx = current.point[0] - previous.point[0], dz = current.point[1] - previous.point[1];
        const options = current.next.filter(next => !seen.has(next.id))
          .sort((a, b) => {
            const score = next => {
              const x = next.point[0] - current.point[0], z = next.point[1] - current.point[1];
              return (dx * x + dz * z) / Math.hypot(x, z);
            };
            return score(b) - score(a);
          });
        if (!options.length) return null;
        previous = current; current = options[0];
      }
      return null;
    };
    const routes = [], signatures = new Set();
    for (const seed of seeds) {
      const anchors = seed.points.map(point => nodes.get(key(point)))
        .filter(candidate => candidate.next.length >= 2 && Math.hypot(...candidate.point) < 260)
        .sort((a, b) => Math.hypot(...a.point) - Math.hypot(...b.point));
      for (const anchor of anchors) {
        let added = false;
        for (let i = 0; i < anchor.next.length && !added; i++) for (let j = i + 1; j < anchor.next.length && !added; j++) {
          const left = extend(anchor, anchor.next[i]), right = extend(anchor, anchor.next[j]);
          if (!left || !right || right.slice(1).some(point => left.slice(1).some(other => key(point) === key(other)))) continue;
          const points = left.slice(1).reverse().concat(right);
          const signature = [key(points[0]), key(points.at(-1))].sort().join('|');
          if (signatures.has(signature)) continue;
          signatures.add(signature);
          routes.push({ points, distance: Math.min(...points.map(point => Math.hypot(...point))),
            length: points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]), 0) });
          added = true;
        }
        if (added) break;
      }
      if (routes.length >= (mobile ? 3 : 5)) break;
    }
    return routes;
  }

  // Uçak seyir irtifasında (~10 km) geçen bir yolcu uçağı gibi görünür. Bu
  // mesafe kameranın derinlik hassasiyetine sığmadığından sahne ölçekli kurulur:
  // model küçültülür, irtifa ve hız gerçek seyirdeki açısal büyüklüğü (~0,3°)
  // ve açısal hızı (~1,4°/sn) verecek şekilde seçilir.
  const FLIGHT = {
    period: 420,          // saniye; iki uçuş arası
    offset: 14,           // ilk uçuşun başlangıcı
    startProgress: 0.32,  // salon açılınca ilk uçak göğe girmiş olsun
    halfPath: 6500,       // m; rota ufuktan ufka
    speed: 48,            // m/s
    minAltitude: 1900, maxAltitude: 2300,
    maxLateral: 1100,     // m; rotanın tam tepeden geçmek zorunda olmaması
    fadeNear: 3600, fadeFar: 6400, // m; uzak uçak pusta kaybolur
    scale: 0.27           // gerçek A320 boyutlarından (37.6 m) ≈10 m
  };
  FLIGHT.duration = FLIGHT.halfPath * 2 / FLIGHT.speed;
  const CONTRAIL = { gap: 20, decay: 3200, fadeAfter: 60, lobeWidth: 1.8, spread: 0.02, engineSeparation: 3.1 };

  function flightProgress(time) {
    const progress = (time % FLIGHT.period - FLIGHT.offset) / FLIGHT.duration;
    return progress >= 0 && progress < 1 ? progress : null;
  }

  function flightIndex(time) {
    return Math.floor((time - FLIGHT.offset) / FLIGHT.period);
  }

  // Deterministik sözde rastgele: aynı uçuş her karede aynı rota ve iz kararını verir.
  function flightRandom(index, salt) {
    let x = Math.imul((index + 1) * 374761393 + salt * 668265263, 1274126177) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1103515245) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  // İz (contrail) yalnızca bazı uçuşlarda oluşur. Yüzey verisinden yüksek irtifa
  // nemi bilinemediğinden olasılık hava durumuna göre yaklaşık seçilir; kapalı,
  // yağışlı veya sisli havada uçak zaten görünmediği için iz de çizilmez.
  function contrailChance(conditions) {
    if (!conditions) return 0.4;
    if (conditions.rain || conditions.snow || conditions.thunder || conditions.fog || conditions.cloud > 0.85) return 0;
    return conditions.cloud > 0.45 ? 0.55 : 0.45;
  }

  function flightPlan(index, conditions) {
    const heading = flightRandom(index, 1) * Math.PI * 2;
    const direction = { x: Math.sin(heading), z: Math.cos(heading) };
    const lateral = (flightRandom(index, 2) * 2 - 1) * FLIGHT.maxLateral;
    const altitude = FLIGHT.minAltitude + flightRandom(index, 3) * (FLIGHT.maxAltitude - FLIGHT.minAltitude);
    const contrail = flightRandom(index, 4) < contrailChance(conditions);
    // Uçak nemli katmana girdiğinde iz başlar; bazen rotanın ortasına doğru.
    const contrailStart = contrail ? flightRandom(index, 5) * 0.35 : null;
    const center = { x: direction.z * lateral, z: -direction.x * lateral };
    return { index, heading, direction, altitude, contrail, contrailStart,
      start: { x: center.x - direction.x * FLIGHT.halfPath, z: center.z - direction.z * FLIGHT.halfPath } };
  }

  function flightPosition(plan, progress) {
    const distance = progress * FLIGHT.halfPath * 2;
    return { x: plan.start.x + plan.direction.x * distance, y: plan.altitude, z: plan.start.z + plan.direction.z * distance };
  }

  function flightLightState(time, daylight) {
    return { night: daylight < 0.35, strobe: time % 1.2 < 0.12, beacon: time % 0.9 < 0.18 };
  }

  function trafficPhase(time, speed, length, phase, direction) {
    const progress = (time * speed / length + phase) % 1;
    return direction > 0 ? progress : 1 - progress;
  }

  function roundSpriteTexture(THREE) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
  }

  function addAirplane(THREE, group) {
    const plane = new THREE.Group();
    plane.name = 'Seyir irtifasında geçen yolcu uçağı';
    // Uzak nesne: salonun sisi uçağı silmesin, uzaklık solması ayrıca yapılır.
    const body = new THREE.MeshStandardMaterial({ color: 0xeef1f3, metalness: 0.35, roughness: 0.42, fog: false });
    const wingPaint = new THREE.MeshStandardMaterial({ color: 0xc7cdd3, metalness: 0.45, roughness: 0.4, fog: false, side: THREE.DoubleSide });
    const engineCowl = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, metalness: 0.5, roughness: 0.38, fog: false });
    const tailPaint = new THREE.MeshStandardMaterial({ color: 0x24476f, metalness: 0.2, roughness: 0.5, fog: false, side: THREE.DoubleSide });
    const model = new THREE.Group();
    // Gövde: burun yuvarlak, kuyruk yukarı doğru incelen dönel profil (gerçek metre).
    const profile = [[0, 18.8], [0.75, 18.4], [1.45, 17.5], [1.85, 16.2], [1.98, 14.2], [1.98, -7], [1.86, -10.5], [1.45, -14.2], [0.85, -17.2], [0.25, -18.8]]
      .map(([r, z]) => new THREE.Vector2(r, z));
    const fuselageGeometry = new THREE.LatheGeometry(profile, 20);
    fuselageGeometry.rotateX(Math.PI / 2);
    model.add(new THREE.Mesh(fuselageGeometry, body));
    // Düz bir planform, burun +Z ve kalınlık aşağı olacak şekilde çevrilir.
    function planform(points, thickness, material, y) {
      const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
      geometry.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y; model.add(mesh);
      return mesh;
    }
    // Geriye açılı (~25°), sivrilen alçak kanat ve yatay stabilizeler.
    planform([[-17.9, -7.6], [-1.9, 3.1], [1.9, 3.1], [17.9, -7.6], [17.9, -9.4], [3.2, -4.4], [-3.2, -4.4], [-17.9, -9.4]], 0.45, wingPaint, -0.9);
    planform([[-6.2, -17.3], [-1.1, -13.4], [1.1, -13.4], [6.2, -17.3], [6.2, -18.6], [-6.2, -18.6]], 0.25, wingPaint, 0.9);
    // Dikey kuyruk: yan profil X'e dik düzlemde.
    const finShape = new THREE.Shape([[-12.2, 1.4], [-17.6, 7.6], [-19.3, 7.6], [-18.7, 1.4]].map(([z, y]) => new THREE.Vector2(z, y)));
    const finGeometry = new THREE.ExtrudeGeometry(finShape, { depth: 0.35, bevelEnabled: false });
    finGeometry.rotateY(-Math.PI / 2); finGeometry.translate(0.175, 0, 0);
    model.add(new THREE.Mesh(finGeometry, tailPaint));
    // Kanat altı iki motor ve pilonları.
    const nacelle = new THREE.CylinderGeometry(1.05, 0.85, 4.4, 16); nacelle.rotateX(Math.PI / 2);
    const pylon = new THREE.BoxGeometry(0.3, 1.1, 2.6);
    for (const side of [-1, 1]) {
      const engine = new THREE.Mesh(nacelle, engineCowl); engine.position.set(side * 5.75, -2.05, 2.1); model.add(engine);
      const strut = new THREE.Mesh(pylon, wingPaint); strut.position.set(side * 5.75, -1.25, 1.2); model.add(strut);
    }
    model.scale.setScalar(FLIGHT.scale);
    plane.add(model);
    // Bu sade model yalnızca yedektir; gerçek A320 modeli yüklenince değiştirilir.
    plane.userData.model = model;
    // Seyir ışıkları piksel boyutludur; uzaktan da görünürler (gerçekte de öyle).
    const sprite = roundSpriteTexture(THREE);
    function lightPoint(positions, color, size) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flatMap(p => p.map(v => v * FLIGHT.scale)), 3));
      const material = new THREE.PointsMaterial({ color, size, map: sprite, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, toneMapped: false });
      return new THREE.Points(geometry, material);
    }
    const lights = new THREE.Group();
    lights.add(lightPoint([[-17.9, -0.9, -8.2]], 0xff3a30, 4), lightPoint([[17.9, -0.9, -8.2]], 0x3dff7c, 4), lightPoint([[0, 1.5, -18.9]], 0xffffff, 3));
    const strobes = [lightPoint([[-17.9, -0.9, -8.6], [17.9, -0.9, -8.6]], 0xffffff, 6)];
    const beacon = lightPoint([[0, -2.1, 0], [0, 2.1, 1]], 0xff2a20, 5);
    lights.add(...strobes, beacon);
    plane.add(lights);
    plane.userData.lights = { group: lights, strobes, beacon };
    plane.userData.fadeMaterials = prepareFadeMaterials([body, wingPaint, engineCowl, tailPaint]);
    plane.visible = false;
    group.add(plane);
    group.userData.airplane = plane;
    group.userData.contrail = addContrail(THREE, group);
    group.userData.flightTime = FLIGHT.offset + FLIGHT.duration * FLIGHT.startProgress;
  }

  function prepareFadeMaterials(materials) {
    for (const material of materials) {
      material.fog = false;
      material.userData.baseOpacity = material.opacity;
      material.userData.baseTransparent = material.transparent;
      material.needsUpdate = true;
    }
    return materials;
  }

  function setFade(materials, opacity) {
    for (const material of materials) {
      // Tam görünürken opak çizilir; yalnızca puslanırken saydamlığa geçilir.
      const transparent = material.userData.baseTransparent || opacity < 0.999;
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = material.userData.baseOpacity * opacity;
    }
  }

  // Açık kaynak A320 modeli (FlightGear, GPLv2) yüklendiğinde yedek modelin yerine konur.
  function setAirplaneModel(THREE, group, source) {
    const plane = group?.userData.airplane;
    if (!plane) return false;
    const model = new THREE.Group();
    source.rotation.set(0, -Math.PI / 2, 0); // kaynak modelde burun +X yönünde
    model.add(source);
    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    source.position.sub(center);
    const materials = new Set();
    model.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = node.receiveShadow = false;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    });
    model.scale.setScalar(FLIGHT.scale);
    const previous = plane.userData.model;
    if (previous) {
      plane.remove(previous);
      previous.traverse(node => {
        node.geometry?.dispose();
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) material?.dispose();
      });
    }
    plane.add(model);
    plane.userData.model = model;
    plane.userData.fadeMaterials = prepareFadeMaterials([...materials]);
    return true;
  }

  // İz, uçağın arkasında yatay duran uzun bir şerittir. İki motor izi uçağa yakın
  // ayrı çizgiler olarak başlar, geride genişleyip tek bir buluta karışır ve söner.
  function addContrail(THREE, group) {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 160);
    const uniforms = {
      uLength: { value: 1 }, uAgeLength: { value: 0 }, uFade: { value: 0 }, uDaylight: { value: 1 }, uDusk: { value: 0 },
      uGap: { value: CONTRAIL.gap }, uDecay: { value: CONTRAIL.decay }, uLobe: { value: CONTRAIL.lobeWidth },
      uSpread: { value: CONTRAIL.spread }, uSeparation: { value: CONTRAIL.engineSeparation },
      uFadeNear: { value: FLIGHT.fadeNear }, uFadeFar: { value: FLIGHT.fadeFar + 600 }
    };
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `
        uniform float uLength, uAgeLength, uLobe, uSpread, uSeparation;
        varying float vDistance; varying float vAcross; varying float vHalfWidth; varying vec3 vWorld;
        void main(){
          float d = uv.y * uLength;
          // Yaş (uçağa uzaklık + uçuş bittikten sonraki süre) arttıkça iz genişler.
          float halfWidth = uSeparation * 0.5 + uLobe + (d + uAgeLength) * uSpread;
          vec3 p = vec3((uv.x * 2.0 - 1.0) * halfWidth, 0.0, -d);
          vDistance = d; vAcross = (uv.x * 2.0 - 1.0) * halfWidth; vHalfWidth = halfWidth;
          vec4 world = modelMatrix * vec4(p, 1.0); vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        uniform float uLength, uAgeLength, uFade, uDaylight, uDusk, uGap, uDecay, uLobe, uSpread, uSeparation, uFadeNear, uFadeFar;
        varying float vDistance; varying float vAcross; varying float vHalfWidth; varying vec3 vWorld;
        void main(){
          float age = vDistance + uAgeLength;
          float sigma = uLobe + age * uSpread;
          float halfGap = uSeparation * 0.5;
          float left = exp(-pow((vAcross + halfGap) / sigma, 2.0));
          float right = exp(-pow((vAcross - halfGap) / sigma, 2.0));
          float profile = min(1.0, left + right);
          float start = smoothstep(uGap * 0.6, uGap * 1.6, vDistance);
          float decay = exp(-age / uDecay);
          float thin = mix(0.95, 0.55, clamp(age / uDecay, 0.0, 1.0));
          float haze = 1.0 - smoothstep(uFadeNear, uFadeFar, distance(vWorld, cameraPosition));
          float alpha = profile * start * decay * thin * haze * uFade * mix(0.06, 1.0, uDaylight);
          if (alpha < 0.004) discard;
          vec3 color = mix(vec3(0.34, 0.38, 0.46), vec3(0.97, 0.98, 1.0), uDaylight);
          color = mix(color, vec3(1.0, 0.72, 0.52), uDusk * 0.55);
          gl_FragColor = vec4(color, alpha);
        }`
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Uçak izi (contrail)';
    mesh.frustumCulled = false;
    mesh.renderOrder = -5;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, uniforms, plan: null, head: null, endedAt: null };
  }

  function updateAirplane(group, dt) {
    const time = group.userData.flightTime;
    const plane = group.userData.airplane, contrail = group.userData.contrail;
    const daylight = group.userData.daylight ?? 1;
    const progress = flightProgress(time);
    const index = flightIndex(time);
    // Uçak göründüğü anda yeni uçuş kurulur (zaman geri sarılsa bile durum tutarlı kalır).
    if (progress !== null && (!plane.visible || !plane.userData.plan || plane.userData.plan.index !== index)) {
      plane.userData.plan = flightPlan(index, group.userData.conditions);
      plane.rotation.y = plane.userData.plan.heading;
      // Yeni uçuş başlarken önceki iz hâlâ sönüyorsa yerinde bırakılır.
      if (plane.userData.plan.contrail) {
        Object.assign(contrail, { plan: plane.userData.plan, head: null, endedAt: null });
      }
    }
    const plan = plane.userData.plan;
    plane.visible = progress !== null;
    if (progress !== null) {
      const position = flightPosition(plan, progress);
      plane.position.set(position.x, position.y, position.z);
      const cameraDistance = Math.hypot(position.x, position.y, position.z);
      const opacity = 1 - Math.min(1, Math.max(0, (cameraDistance - FLIGHT.fadeNear) / (FLIGHT.fadeFar - FLIGHT.fadeNear)));
      setFade(plane.userData.fadeMaterials, opacity);
      const flightLights = flightLightState(time, daylight);
      plane.userData.lights.group.visible = flightLights.night && opacity > 0.05;
      plane.userData.lights.strobes.forEach(strobe => { strobe.visible = flightLights.strobe; });
      plane.userData.lights.beacon.visible = flightLights.beacon;
    }
    // İz: başlangıç noktası sabit, uç uçağı izler; uçuş bitince yerinde söner.
    const trail = contrail.plan;
    if (!trail) { contrail.mesh.visible = false; return; }
    const sameFlight = progress !== null && trail.index === index;
    if (sameFlight && progress >= trail.contrailStart) contrail.head = flightPosition(trail, progress);
    else if (!sameFlight && contrail.head && contrail.endedAt === null) contrail.endedAt = time;
    if (!contrail.head) { contrail.mesh.visible = false; return; }
    const tail = flightPosition(trail, trail.contrailStart);
    const length = Math.hypot(contrail.head.x - tail.x, contrail.head.z - tail.z);
    const afterEnd = contrail.endedAt === null ? 0 : time - contrail.endedAt;
    const fade = Math.max(0, 1 - afterEnd / CONTRAIL.fadeAfter);
    if (fade <= 0 || length < 1) { contrail.mesh.visible = false; if (fade <= 0) contrail.plan = null; return; }
    contrail.mesh.visible = true;
    contrail.mesh.position.set(contrail.head.x, trail.altitude - 0.4, contrail.head.z);
    contrail.mesh.rotation.y = trail.heading;
    const u = contrail.uniforms;
    u.uLength.value = length; u.uAgeLength.value = afterEnd * FLIGHT.speed; u.uFade.value = fade;
    u.uDaylight.value = daylight; u.uDusk.value = group.userData.dusk ?? 0;
  }

  function addTraffic(THREE, group, roads, plan, mobile) {
    const routes = trafficRoutes(roads, plan, mobile);
    if (!routes.length) return;
    const kinds = mobile ? ['minibus', 'truck', 'car', 'minibus', 'lorry', 'car', 'minibus', 'truck'] :
      ['minibus', 'truck', 'car', 'lorry', 'minibus', 'car', 'truck', 'minibus', 'lorry', 'car', 'minibus', 'truck', 'car', 'lorry', 'minibus', 'truck'];
    const glass = new THREE.MeshStandardMaterial({ color: 0x7696a2, metalness: 0.08, roughness: 0.2 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x202326, roughness: 1 });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff0b8, toneMapped: false });
    const tailLamp = new THREE.MeshBasicMaterial({ color: 0xff3028, toneMapped: false });
    const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 8);
    const lightGeometry = new THREE.BoxGeometry(0.22, 0.18, 0.08);
    const vehicles = kinds.map((kind, index) => {
      const route = routes[index % routes.length];
      const curve = new THREE.CurvePath();
      for (let i = 1; i < route.points.length; i++) {
        const [ax, az] = route.points[i - 1], [bx, bz] = route.points[i];
        curve.add(new THREE.LineCurve3(new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz)));
      }
      const length = curve.getLength();
      const vehicle = new THREE.Group();
      const cargo = kind === 'lorry', truck = kind === 'truck', minibus = kind === 'minibus';
      const bodyLength = cargo ? 8.8 : truck ? 5.8 : minibus ? 5.2 : 3.8;
      const bodyWidth = cargo ? 2.35 : truck ? 2.15 : minibus ? 1.9 : 1.75;
      const color = [0xf2eee1, 0x4a7185, 0xc6d1cf, 0xe9e2cf, 0x9b4c45, 0xd4c6a8, 0x74816d, 0xc9c8c0][index % 8];
      const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.1 });
      const cargoPaint = new THREE.MeshStandardMaterial({ color: cargo ? 0xd6d3c9 : 0xb4b6af, roughness: 0.8 });
      function box(width, height, depth, x, y, z, material) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        mesh.position.set(x, y, z); vehicle.add(mesh);
      }
      box(bodyWidth, 0.6, bodyLength, 0, 0.78, 0, paint);
      if (cargo || truck) {
        box(bodyWidth - 0.15, 2.1, cargo ? 5.8 : 3.2, 0, 1.9, cargo ? -1.3 : -0.7, cargoPaint);
        box(bodyWidth - 0.2, 1.55, 2.2, 0, 1.65, bodyLength / 2 - 1.1, paint);
        box(bodyWidth - 0.35, 0.58, 0.05, 0, 1.95, bodyLength / 2 + 0.02, glass);
      } else {
        box(bodyWidth - 0.12, minibus ? 1.45 : 0.9, bodyLength - 0.75, 0, minibus ? 1.6 : 1.45, -0.15, paint);
        box(bodyWidth - 0.28, minibus ? 0.55 : 0.4, 0.05, 0, minibus ? 1.85 : 1.65, bodyLength / 2 - 0.48, glass);
        if (minibus) for (const side of [-1, 1]) for (const z of [-1.4, -0.3, 0.8]) box(0.05, 0.58, 0.82, side * (bodyWidth / 2 - 0.05), 1.86, z, glass);
      }
      for (const side of [-1, 1]) for (const z of [-bodyLength * 0.32, bodyLength * 0.32]) {
        const wheel = new THREE.Mesh(wheelGeometry, rubber);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * bodyWidth / 2, 0.36, z);
        vehicle.add(wheel);
      }
      const lights = new THREE.Group();
      for (const side of [-1, 1]) {
        const headlight = new THREE.Mesh(lightGeometry, lamp);
        headlight.position.set(side * bodyWidth * 0.34, 0.88, bodyLength / 2 + 0.05);
        lights.add(headlight);
        const taillight = new THREE.Mesh(lightGeometry, tailLamp);
        taillight.position.set(side * bodyWidth * 0.34, 0.88, -bodyLength / 2 - 0.05);
        lights.add(taillight);
      }
      vehicle.add(lights);
      vehicle.visible = false;
      group.add(vehicle);
      return { vehicle, lights, curve, length, direction: index % 2 ? -1 : 1, speed: kind === 'car' ? 9 : kind === 'minibus' ? 7 : 5.5, phase: (index + 0.4) / kinds.length };
    });
    group.userData.traffic = { vehicles, time: 0 };
  }

  function tick(group, dt) {
    group.userData.flightTime += dt;
    updateAirplane(group, dt);
    const traffic = group.userData.traffic;
    if (!traffic) return;
    traffic.time += dt;
    for (const item of traffic.vehicles) {
      const t = trafficPhase(traffic.time, item.speed, item.length, item.phase, item.direction);
      const point = item.curve.getPoint(t);
      const look = Math.min(0.03, 2 / item.length);
      const tangent = item.curve.getPoint(Math.min(1, t + look))
        .sub(item.curve.getPoint(Math.max(0, t - look))).normalize().multiplyScalar(item.direction);
      const lane = 1.2;
      item.vehicle.position.set(point.x + tangent.z * lane, GROUND_Y + 0.04, point.z - tangent.x * lane);
      item.vehicle.rotation.y = Math.atan2(tangent.x, tangent.z);
      item.vehicle.visible = Math.hypot(point.x, point.z) < 260;
    }
  }

  function facadeTextures(THREE) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const emissive = document.createElement('canvas'); emissive.width = emissive.height = 256;
    const ctx = canvas.getContext('2d'), light = emissive.getContext('2d');
    ctx.fillStyle = '#dad4c6'; ctx.fillRect(0, 0, 256, 256);
    let seed = 17;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(70,60,45,0.05)' : 'rgba(255,255,245,0.12)';
      ctx.fillRect(random() * 256, random() * 256, 1, 2);
    }
    light.fillStyle = '#000'; light.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const x = col * 64 + 18, y = row * 64 + 12;
      ctx.fillStyle = '#bcb7ac'; ctx.fillRect(col * 64, row * 64 + 57, 64, 3);
      ctx.fillStyle = '#837f77'; ctx.fillRect(x - 2, y - 2, 31, 39);
      ctx.fillStyle = '#ebebe4'; ctx.fillRect(x, y, 27, 34);
      const reflection = ctx.createLinearGradient(x, y, x + 25, y + 33);
      reflection.addColorStop(0, '#aec0c8'); reflection.addColorStop(0.42, '#708895'); reflection.addColorStop(1, '#34494e');
      ctx.fillStyle = reflection; ctx.fillRect(x + 2, y + 2, 23, 30);
      ctx.fillStyle = '#e0e1d8'; ctx.fillRect(x + 12, y + 2, 2, 30);
      ctx.fillStyle = '#aaa699'; ctx.fillRect(x - 3, y + 35, 34, 3);
      if ((row * 7 + col * 3) % 5 < 2) {
        light.fillStyle = '#f5c887'; light.fillRect(x + 2, y + 2, 23, 30);
        light.fillStyle = '#312617'; light.fillRect(x + 12, y + 2, 2, 30);
      }
    }
    const map = new THREE.CanvasTexture(canvas), emissiveMap = new THREE.CanvasTexture(emissive);
    for (const texture of [map, emissiveMap]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }
    return { map, emissiveMap };
  }

  function surfaceTexture(THREE, tiled = false) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#b9b8b0'; ctx.fillRect(0, 0, 256, 256);
    let seed = 41;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(40,38,30,0.07)' : 'rgba(255,255,245,0.22)';
      ctx.fillRect(random() * 256, random() * 256, 2, 1);
    }
    if (tiled) {
      ctx.strokeStyle = 'rgba(65,65,60,0.25)'; ctx.lineWidth = 1;
      for (let i = 0; i < 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  function create(THREE, plan, mobile = false, reducedMotion = false) {
    const group = new THREE.Group(); group.name = 'Karaağaç çevresi';
    const sky = GallerySky.create(THREE, { mobile, reducedMotion });
    group.add(sky.mesh);
    const groundMap = surfaceTexture(THREE); groundMap.repeat.set(300, 300);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x92906d, map: groundMap, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), groundMaterial);
    ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y - 0.08; group.add(ground);
    group.userData.sky = sky;
    addAirplane(THREE, group);
    group.userData.facades = [];
    group.userData.weatherSurfaces = [];
    group.userData.reducedMotion = reducedMotion;
    return group;
  }

  function populate(THREE, group, data, plan, mobile, mergeGeometries) {
    const selected = selectFeatures(data, plan, mobile);
    const geometryBatches = new Map(), materials = new Map();
    const facade = facadeTextures(THREE);
    const grain = surfaceTexture(THREE), paving = surfaceTexture(THREE, true);
    const shadeCanvas = document.createElement('canvas'); shadeCanvas.width = shadeCanvas.height = 64;
    const shade = shadeCanvas.getContext('2d'), gradient = shade.createRadialGradient(32, 32, 8, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(25,30,27,0.3)'); gradient.addColorStop(1, 'rgba(25,30,27,0)');
    shade.fillStyle = gradient; shade.fillRect(0, 0, 64, 64);
    const shadeMap = new THREE.CanvasTexture(shadeCanvas);
    const palette = [0xffffff, 0xdbdfdf, 0xddd2ba, 0xcfb9a3, 0xc6ccbc];
    function material(key) {
      if (materials.has(key)) return materials.get(key);
      let result;
      if (key.startsWith('facade')) {
        result = new THREE.MeshStandardMaterial({ ...facade, color: palette[Number(key.slice(-1))], roughness: 0.87, emissive: 0xffdfa3, emissiveIntensity: 0 });
        group.userData.facades.push(result);
      } else if (key === 'contact') {
        result = new THREE.MeshBasicMaterial({ map: shadeMap, transparent: true, depthWrite: false, toneMapped: false });
      } else {
        const colors = { roof: 0x987366, flatRoof: 0xa0a09a, road: 0x53575a, track: 0xa19379, sidewalk: 0xc2c0b5, line: 0xdedbcc, grass: 0x88956b, wood: 0x607656, campus: 0xb7b4a3, pitch: 0x5c8062, industry: 0xa8a598, water: 0x738e97, trim: 0xdedbd1, plinth: 0x8a8982 };
        const map = ['line','trim','plinth'].includes(key) ? null : ['campus','sidewalk'].includes(key) ? paving : grain;
        result = new THREE.MeshStandardMaterial({ color: colors[key] || 0x999779, map, roughness: 0.96, side: key === 'line' ? THREE.DoubleSide : THREE.FrontSide });
        if (['road','sidewalk','roof','flatRoof'].includes(key)) group.userData.weatherSurfaces.push(result);
      }
      materials.set(key, result); return result;
    }
    function add(key, geometry) {
      if (!geometryBatches.has(key)) geometryBatches.set(key, []);
      // Bütün birleştirilecek geometriler aynı özniteliklere sahiptir.
      geometryBatches.get(key).push(geometry.index ? geometry.toNonIndexed() : geometry);
      if (geometry.index) geometry.dispose();
      material(key);
    }
    function polygon(points, y, key) {
      if (points.length < 4) return;
      const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], -p[1])));
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2); geometry.translate(0, y, 0);
      const positions = geometry.attributes.position, uv = geometry.attributes.uv;
      for (let i=0;i<positions.count;i++) uv.setXY(i, positions.getX(i)/5, positions.getZ(i)/5);
      add(key, geometry);
    }
    function strip(a, b, width, y, key) {
      const dx = b[0]-a[0], dz = b[1]-a[1], length = Math.hypot(dx,dz);
      if (length < 0.05) return;
      const geometry = new THREE.PlaneGeometry(width,length);
      const uv = geometry.attributes.uv;
      for (let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*width/5,uv.getY(i)*length/5);
      geometry.rotateX(-Math.PI/2); geometry.rotateY(Math.atan2(dx,dz));
      geometry.translate((a[0]+b[0])/2,y,(a[1]+b[1])/2); add(key,geometry);
    }

    for (const area of selected.areas) {
      const t = area.tags;
      const key = t.natural === 'wood' ? 'wood' : t.natural === 'water' ? 'water' : t.leisure === 'pitch' ? 'pitch' : t.amenity === 'school' ? 'campus' : t.landuse === 'industrial' ? 'industry' : ['grass','grassland','forest'].includes(t.landuse || t.natural) ? 'grass' : null;
      if (key) polygon(area.points, key === 'campus' || key === 'pitch' ? 0.006 : -0.02, key);
    }
    for (const road of selected.roads) {
      const dirt = ['track','path','footway'].includes(road.tags.highway) || ['ground','dirt','unpaved'].includes(road.tags.surface);
      const width = dirt ? 3 : road.tags.highway === 'service' ? 5 : road.tags.highway === 'residential' ? 6 : 8;
      for (let i=1;i<road.points.length;i++) {
        const a=road.points[i-1], b=road.points[i];
        if (!dirt) strip(a,b,width+2.2,0.012,'sidewalk');
        strip(a,b,width,0.026,dirt?'track':'road');
        const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        if (!dirt && width>=8) for(let step=1;step<length-3;step+=10) {
          const point = s => [a[0]+(b[0]-a[0])*s/length,a[1]+(b[1]-a[1])*s/length];
          strip(point(step),point(Math.min(step+4,length)),0.12,0.032,'line');
        }
      }
    }
    addTraffic(THREE, group, selected.roads, plan, mobile);
    for (const feature of selected.buildings) {
      const points = feature.points, height = buildingHeight(feature);
      const b = bounds(points), near = Math.hypot((b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2) < 200;
      if (near) {
        const shadow = new THREE.PlaneGeometry(b.maxX-b.minX+12,b.maxZ-b.minZ+12);
        shadow.rotateX(-Math.PI/2); shadow.translate((b.minX+b.maxX)/2,0.04,(b.minZ+b.maxZ)/2); add('contact',shadow);
      }
      const position=[], uv=[];
      for(let i=1;i<points.length;i++) {
        const a=points[i-1], b=points[i], length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        const corners=[[a[0],0,a[1]],[b[0],0,b[1]],[b[0],height,b[1]],[a[0],height,a[1]]];
        const texture=[[0,0],[length/12,0],[length/12,height/12.4],[0,height/12.4]];
        for(const index of [0,2,1,0,3,2]) { position.push(...corners[index]); uv.push(...texture[index]); }
        if (near && length > 0.1) {
          // Yakın cephede fiziksel saçak, kaide ve kat silmeleri düz kutu hissini azaltır.
          const ledge = (y, thickness, depth, key) => {
            const trim = new THREE.BoxGeometry(length + 0.14, thickness, depth);
            trim.rotateY(-Math.atan2(b[1]-a[1], b[0]-a[0]));
            trim.translate((a[0]+b[0])/2,y,(a[1]+b[1])/2); add(key,trim);
          };
          ledge(0.28,0.56,0.22,'plinth');
          ledge(height+0.12,0.3,0.55,'trim');
          for(let floor=3.1;floor<height-0.5;floor+=3.1) ledge(floor,0.12,0.22,'trim');
        }
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); geometry.computeVertexNormals();
      // Halka yönünden bağımsız cephe görünümü; iç mekânla kesişen yapılar zaten ayıklandı.
      const key='facade'+(Number(feature.id)%palette.length); material(key).side=THREE.DoubleSide;
      add(key,geometry);
      polygon(points,height+0.03,feature.tags.building==='industrial'?'flatRoof':'roof');
    }
    for (const [key, geometries] of geometryBatches) {
      const merged=mergeGeometries(geometries,false);
      geometries.forEach(geometry=>geometry.dispose());
      if (!merged) throw new Error('Çevre geometrisi birleştirilemedi.');
      const mesh=new THREE.Mesh(merged,materials.get(key)); mesh.position.y=GROUND_Y; group.add(mesh);
    }
    if (!selected.buildings.length) { facade.map.dispose(); facade.emissiveMap.dispose(); }
    if (!materials.has('contact')) shadeMap.dispose();
    if (![...materials.values()].some(m=>m.map===grain)) grain.dispose();
    if (![...materials.values()].some(m=>m.map===paving)) paving.dispose();

    // Haritada işaretli ağaçlar tek çizim grubunda; rastgele binalar veya yollar eklenmez.
    const trees = selected.trees.filter(p=>Math.abs(p[0])>plan.width/2+3 || Math.abs(p[1])>plan.depth/2+3);
    if(trees.length) {
      const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16,0.25,3.6,6),new THREE.MeshStandardMaterial({color:0x665d48,roughness:1}),trees.length);
      const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2,1),new THREE.MeshStandardMaterial({color:0x647b4d,roughness:1}),trees.length);
      const dummy=new THREE.Object3D();
      trees.forEach((p,i)=>{ dummy.position.set(p[0],GROUND_Y+1.8,p[1]);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);dummy.position.y=GROUND_Y+4.5;dummy.scale.set(1,1.25,1);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);dummy.scale.set(1,1,1); });
      group.add(trunks,crowns);
    }
    group.userData.loaded = true;
    group.userData.counts = { buildings: selected.buildings.length, roads: selected.roads.length };
  }

  function update(THREE, group, cycle, sunPosition, weather, report) {
    group.userData.sky.update(cycle,sunPosition,weather,report);
    group.userData.daylight = cycle.daylight;
    group.userData.dusk = cycle.dusk;
    group.userData.conditions = weather || null;
    for (const item of group.userData.traffic?.vehicles || []) item.lights.visible = cycle.daylight < 0.35;
    for(const facade of group.userData.facades) facade.emissiveIntensity=(1-cycle.daylight)*0.8;
    for(const surface of group.userData.weatherSurfaces) surface.roughness=weather?.rain ? 0.42 : 0.96;
  }

  return { SITE, selectFeatures, buildingHeight, trafficRoutes, trafficPhase, flightProgress, flightIndex, flightPlan, flightPosition, contrailChance, flightLightState, FLIGHT, CONTRAIL, setAirplaneModel, create, populate, update, tick };
});
