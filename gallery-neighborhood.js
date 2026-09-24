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

  function flightProgress(time) {
    const progress = (time % 85 - 10) / 18;
    return progress >= 0 && progress < 1 ? progress : null;
  }

  function flightLightState(time, daylight) {
    return { night: daylight < 0.35, strobe: time % 1.2 < 0.12, beacon: time % 0.9 < 0.18 };
  }

  function trafficPhase(time, speed, length, phase, direction) {
    const progress = (time * speed / length + phase) % 1;
    return direction > 0 ? progress : 1 - progress;
  }

  function addAirplane(THREE, group) {
    const plane = new THREE.Group();
    plane.name = 'Cam tavanin ustunden gecen ucak';
    const body = new THREE.MeshStandardMaterial({ color: 0xe7e9e8, metalness: 0.2, roughness: 0.62, side: THREE.DoubleSide });
    const trim = new THREE.MeshStandardMaterial({ color: 0x677d8e, metalness: 0.15, roughness: 0.65 });
    function part(width, height, depth, x, y, z, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z); plane.add(mesh);
    }
    part(0.95, 0.85, 8, 0, 0, 0, body);
    part(11, 0.16, 1.25, 0, 0, 0.3, body);
    part(3.8, 0.13, 0.75, 0, 0.15, -3.25, body);
    part(0.14, 1.25, 1.1, 0, 0.65, -3.3, trim);
    part(0.75, 0.18, 1.4, 0, -0.08, 2.65, trim);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.4, 8), body);
    nose.rotation.x = Math.PI / 2; nose.position.z = 4.65; plane.add(nose);
    const lights = new THREE.Group(), bulb = new THREE.SphereGeometry(0.25, 8, 6);
    const red = new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false });
    const green = new THREE.MeshBasicMaterial({ color: 0x38ff79, toneMapped: false });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    function light(x, y, z, material) {
      const mesh = new THREE.Mesh(bulb, material);
      mesh.position.set(x, y, z); lights.add(mesh);
      return mesh;
    }
    light(-5.48, -0.08, 0.3, red);
    light(5.48, -0.08, 0.3, green);
    light(0, 0.18, -3.68, white);
    for (const side of [-1, 1]) light(side * 0.58, -0.34, 2.9, white);
    const strobes = [-1, 1].map(side => light(side * 5.37, -0.18, 0.3, white));
    const beacon = light(0, -0.48, 0, red);
    lights.visible = false; plane.add(lights);
    plane.userData.lights = { group: lights, strobes, beacon };
    plane.rotation.y = Math.atan2(240, -70);
    plane.visible = false;
    group.add(plane);
    group.userData.airplane = plane;
    group.userData.flightTime = 0;
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
    const flight = flightProgress(group.userData.flightTime);
    const plane = group.userData.airplane;
    plane.visible = flight !== null;
    if (flight !== null) plane.position.set(-120 + 240 * flight, 48, 35 - 70 * flight);
    const flightLights = flightLightState(group.userData.flightTime, group.userData.daylight ?? 1);
    plane.userData.lights.group.visible = flightLights.night;
    plane.userData.lights.strobes.forEach(strobe => { strobe.visible = flightLights.strobe; });
    plane.userData.lights.beacon.visible = flightLights.beacon;
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
    for (const item of group.userData.traffic?.vehicles || []) item.lights.visible = cycle.daylight < 0.35;
    for(const facade of group.userData.facades) facade.emissiveIntensity=(1-cycle.daylight)*0.8;
    for(const surface of group.userData.weatherSurfaces) surface.roughness=weather?.rain ? 0.42 : 0.96;
  }

  return { SITE, selectFeatures, buildingHeight, trafficRoutes, trafficPhase, flightProgress, flightLightState, create, populate, update, tick };
});
