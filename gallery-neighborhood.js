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

  function create(THREE, plan) {
    const group = new THREE.Group(); group.name = 'Karaağaç çevresi';
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, toneMapped: false,
      uniforms: { daylight: { value: 1 }, dusk: { value: 0 }, cloudCover: { value: 0.25 }, storm: { value: 0 }, sunDirection: { value: new THREE.Vector3(0.2, 0.7, 0.7) } },
      vertexShader: 'varying vec3 vDirection; void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vDirection; uniform float daylight; uniform float dusk; uniform float cloudCover; uniform float storm; uniform vec3 sunDirection;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main() {
          vec3 d = normalize(vDirection); float h = max(0.0, d.y);
          vec3 day = mix(vec3(0.76,0.81,0.80), vec3(0.30,0.53,0.73), pow(h,0.55));
          vec3 night = mix(vec3(0.065,0.09,0.13), vec3(0.008,0.018,0.04), pow(h,0.4));
          vec3 color = mix(night, day, daylight);
          color += dusk * vec3(0.28,0.09,0.025) * pow(1.0-h,5.0);
          vec2 uv = d.xz / max(0.16,d.y + 0.2);
          float cloud = noise(uv*2.0)*0.55 + noise(uv*4.5)*0.3 + noise(uv*10.0)*0.15;
          cloud = smoothstep(0.85-cloudCover*0.7,1.05-cloudCover*0.65,cloud) * smoothstep(0.01,0.25,h);
          color = mix(color, mix(vec3(0.1,0.13,0.18),vec3(0.95,0.94,0.88),daylight),cloud*0.8);
          color = mix(color,mix(vec3(0.035,0.045,0.065),vec3(0.43,0.47,0.49),daylight),cloudCover*0.6+storm*0.25);
          float sun = max(0.0,dot(d,normalize(sunDirection)));
          color += vec3(1.0,0.8,0.55) * (pow(sun,1500.0)*0.7 + pow(sun,30.0)*0.1) * daylight * (1.0-cloudCover);
          gl_FragColor = vec4(color,1.0);
        }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1250, 32, 16), skyMaterial);
    sky.renderOrder = -10; group.add(sky);
    const groundMap = surfaceTexture(THREE); groundMap.repeat.set(300, 300);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x92906d, map: groundMap, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), groundMaterial);
    ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y - 0.08; group.add(ground);
    group.userData.skyMaterial = skyMaterial;
    group.userData.facades = [];
    group.userData.weatherSurfaces = [];
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
      const width = dirt ? 3 : road.tags.highway === 'service' ? 4 : road.tags.highway === 'residential' ? 6 : 8;
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

  function update(THREE, group, cycle, sunPosition, weather) {
    const sky=group.userData.skyMaterial;
    sky.uniforms.daylight.value=cycle.daylight; sky.uniforms.dusk.value=cycle.dusk;
    sky.uniforms.sunDirection.value.copy(sunPosition).normalize();
    sky.uniforms.cloudCover.value=weather?.cloud ?? 0.25;
    sky.uniforms.storm.value=weather?.thunder ? 1 : 0;
    for(const facade of group.userData.facades) facade.emissiveIntensity=(1-cycle.daylight)*0.8;
    for(const surface of group.userData.weatherSurfaces) surface.roughness=weather?.rain ? 0.42 : 0.96;
  }

  return { SITE, selectFeatures, buildingHeight, create, populate, update };
});
