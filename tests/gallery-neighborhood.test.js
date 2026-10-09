const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const api = require('../gallery-neighborhood');
const { SITE, selectFeatures, buildingHeight, trafficRoutes, flightProgress, flightIndex, flightPlan, flightPosition, contrailChance, flightLightState, FLIGHT } = api;
const data = require('../assets/environment/kapakli.json');
const { plan } = require('../gallery-layout');

test('harita kaynagi okul koordinati ve lisans bilgisiyle birlikte dagitilir', () => {
  assert.equal(data.origin.latitude, SITE.latitude);
  assert.equal(data.origin.longitude, SITE.longitude);
  assert.equal(data.origin.timezone, SITE.timezone);
  assert.match(data.attribution, /OpenStreetMap/);
  assert.match(data.license, /opendatacommons.org\/licenses\/odbl\/1-0\//);
  assert.ok(data.features.some(feature => feature.tags.highway));
});

test('gercek binalar buyuyen sanal salonun icine girmez ve mobil butce korunur', () => {
  for (const count of [1,28,2000]) for (const mobile of [true,false]) {
    const room = plan(count), result = selectFeatures(data, room, mobile);
    assert.ok(result.buildings.length > 0 && result.buildings.length <= (mobile ? 180 : 280));
    assert.ok(result.roads.length > 0);
    for (const building of result.buildings) {
      const xs=building.points.map(p=>p[0]), zs=building.points.map(p=>p[1]);
      assert.ok(Math.min(...xs)>=room.width/2+2 || Math.max(...xs)<=-room.width/2-2 ||
        Math.min(...zs)>=room.depth/2+2 || Math.max(...zs)<=-room.depth/2-2);
    }
  }
});

test('harita yuksekligi varsa korunur, kat sayisi ve eksik veri olculu yorumlanir', () => {
  assert.equal(buildingHeight({ tags: { height: '15.4', 'building:levels': '6' } }), 15.4);
  assert.equal(buildingHeight({ tags: { 'building:levels': '6' } }), 18.6);
  assert.equal(buildingHeight({ tags: { building: 'industrial' } }), 8);
  assert.equal(buildingHeight({ tags: { height: '-5' } }), 6.2);
});

test('trafik yalnizca salon disindaki gercek arac yollarini kullanir', () => {
  const room = plan(28);
  for (const mobile of [true, false]) {
    const routes = trafficRoutes(selectFeatures(data, room, mobile).roads, room, mobile);
    assert.ok(routes.length > 0 && routes.length <= (mobile ? 3 : 5));
    assert.ok(routes.every(route => route.distance > room.depth / 2 + 4 && route.length > 55));
    assert.ok(routes.every(route => route.points.length >= 2));
    assert.ok(routes.every(route => Math.hypot(...route.points[0]) > 260 && Math.hypot(...route.points.at(-1)) > 260));
    const edges = new Set(selectFeatures(data, room, mobile).roads.flatMap(road => road.points.slice(1).map((point, i) =>
      [road.points[i].join(','), point.join(',')].sort().join('|'))));
    for (const route of routes) for (let i = 1; i < route.points.length; i++)
      assert.ok(edges.has([route.points[i - 1].join(','), route.points[i].join(',')].sort().join('|')));
  }
});

test('ucak arada bir gecer ve gecisler arasinda gorunmez', () => {
  const { period, offset, duration } = FLIGHT;
  assert.equal(flightProgress(offset - 1), null);
  assert.equal(flightProgress(offset), 0);
  assert.equal(flightProgress(offset + duration / 2), 0.5);
  assert.equal(flightProgress(offset + duration + 1), null);
  assert.equal(flightProgress(period + offset), 0);
  assert.equal(flightIndex(offset + 5), 0);
  assert.equal(flightIndex(period + offset + 5), 1);
  assert.deepEqual(flightLightState(0.05, 0.2), { night: true, strobe: true, beacon: true });
  assert.deepEqual(flightLightState(0.3, 0.2), { night: true, strobe: false, beacon: false });
  assert.equal(flightLightState(0.05, 1).night, false);
});

test('ucak seyir irtifasinda, gercekci hizla ve ufuktan ufka ucar', () => {
  assert.ok(FLIGHT.minAltitude >= 900, 'dron gibi alcaktan gecmemeli');
  // Tepeden geciste acisal hiz gercek bir yolcu ucagina yakin kalmali (derece/saniye).
  const angular = FLIGHT.speed / FLIGHT.maxAltitude * 180 / Math.PI;
  assert.ok(angular > 1 && angular < 4, 'acisal hiz: ' + angular);
  for (let index = 0; index < 50; index++) {
    const plan = flightPlan(index, null);
    const start = flightPosition(plan, 0), end = flightPosition(plan, 1), middle = flightPosition(plan, 0.5);
    assert.ok(Math.hypot(start.x, start.z) > 2500 && Math.hypot(end.x, end.z) > 2500, 'ufuktan gelip ufka gitmeli');
    assert.ok(Math.hypot(middle.x, middle.z) <= FLIGHT.maxLateral + 1e-6);
    assert.ok(plan.altitude >= FLIGHT.minAltitude && plan.altitude <= FLIGHT.maxAltitude);
    assert.deepEqual(flightPlan(index, null), plan, 'ayni ucus her karede ayni rotayi kullanmali');
  }
});

test('ucak izi yalnizca bazi ucuslarda ve uygun havada olusur', () => {
  const clear = { cloud: 0.1, rain: false, snow: false, thunder: false, fog: false };
  const withTrail = Array.from({ length: 200 }, (_, index) => flightPlan(index, clear).contrail).filter(Boolean).length;
  assert.ok(withTrail > 50 && withTrail < 150, 'arasira iz: ' + withTrail + '/200');
  for (const bad of [{ ...clear, rain: true }, { ...clear, fog: true }, { ...clear, thunder: true }, { ...clear, cloud: 0.95 }]) {
    assert.equal(contrailChance(bad), 0);
    assert.ok(Array.from({ length: 50 }, (_, index) => flightPlan(index, bad)).every(plan => !plan.contrail && plan.contrailStart === null));
  }
  const plan = Array.from({ length: 50 }, (_, index) => flightPlan(index, clear)).find(item => item.contrail);
  assert.ok(plan.contrailStart >= 0 && plan.contrailStart < 0.35);
});

async function neighborhood(t, source = data, mobile = false) {
  const THREE = await import(pathToFileURL(path.join(__dirname, '../vendor/three.module.js')).href);
  const { mergeGeometries } = await import(pathToFileURL(path.join(__dirname, '../vendor/utils/BufferGeometryUtils.js')).href);
  const previousDocument = global.document, previousSky = global.GallerySky;
  const gradient = () => ({ addColorStop() {} });
  global.document = { createElement: () => ({ getContext: () => ({
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    createLinearGradient: gradient, createRadialGradient: gradient
  }) }) };
  global.GallerySky = { create: () => ({ mesh: new THREE.Group(), update() {} }) };
  const room = plan(28), group = api.create(THREE, room, mobile);
  t.after(() => {
    global.document = previousDocument; global.GallerySky = previousSky;
    const resources = new Set();
    group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) {
        resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
    });
    resources.forEach(resource => resource.dispose());
  });
  api.populate(THREE, group, source, room, mobile, mergeGeometries);
  return { THREE, group };
}

function vehicleCorners(THREE, item) {
  const body = item.vehicle.children[0];
  body.updateWorldMatrix(true, false); body.geometry.computeBoundingBox();
  const { min, max } = body.geometry.boundingBox;
  return [[min.x - 0.1, min.z], [max.x + 0.1, min.z], [max.x + 0.1, max.z], [min.x - 0.1, max.z]]
    .map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(body.matrixWorld));
}

function overlappingBodies(a, b) {
  for (const corners of [a, b]) for (let i = 0; i < 2; i++) {
    const dx = corners[i + 1].x - corners[i].x, dz = corners[i + 1].z - corners[i].z;
    const project = points => points.map(p => p.x * dz - p.z * dx);
    const pa = project(a), pb = project(b);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-7 || Math.max(...pb) <= Math.min(...pa) + 1e-7) return false;
  }
  return true;
}

for (const mobile of [false, true]) test(`trafik takip mesafesini ve kavsak sirasini korur, bekleyip yeniden ilerler (${mobile ? 'mobil' : 'masaustu'})`, async t => {
  const { THREE, group } = await neighborhood(t, data, mobile), traffic = group.userData.traffic;
  const { vehicles } = traffic, moved = vehicles.map(() => 0), waited = new Set(), resumed = new Set();
  assert.equal(vehicles.length, mobile ? 8 : 16);
  assert.equal(new Set(vehicles.map(item => item.curve)).size, trafficRoutes(selectFeatures(data, plan(28), mobile).roads, plan(28), mobile).length);
  let wrapped = false;
  for (let frame = 0; frame < 3600; frame++) {
    const before = vehicles.map(item => item.distance);
    api.tick(group, 0.05);
    vehicles.forEach((item, i) => {
      wrapped ||= item.distance < before[i];
      moved[i] += (item.distance - before[i] + item.length) % item.length;
      if (item.velocity < 0.5 && item.zones.some(area => area.exit > item.distance && area.zone.owner && area.zone.owner !== item)) waited.add(item);
      if (waited.has(item) && item.velocity > 2) resumed.add(item);
      for (const area of item.zones) if (item.distance > area.entry + 0.05 && item.distance < area.exit - 0.05)
        assert.equal(area.zone.owner, item, 'kavsağa sırayı almadan girilmemeli');
    });
    if (frame % 5) continue;
    const corners = vehicles.map(item => item.spawned ? vehicleCorners(THREE, item) : null);
    for (let i = 0; i < vehicles.length; i++) for (let j = i + 1; j < vehicles.length; j++) {
      if (!corners[i] || !corners[j] || vehicles[i].vehicle.position.distanceTo(vehicles[j].vehicle.position) > 14) continue;
      assert.ok(!overlappingBodies(corners[i], corners[j]), `araçlar iç içe girdi: ${i}/${j}, t=${frame / 20}`);
    }
  }
  assert.ok(moved.every(distance => distance > 150), 'hiçbir araç kalıcı olarak kilitlenmemeli');
  assert.ok(resumed.size > 0, 'kavşakta bekleyen araç yeniden hareket etmeli');
  assert.ok(wrapped, 'araçlar görüş dışında yeni tura başlamalı');
});

test('hizli arac ayni seritteki yavas araci gecmeden takip eder', async t => {
  const source = { version: 1, features: [{ tags: { highway: 'residential' }, points: [[-300, 80], [0, 80], [300, 80]] }] };
  const { group } = await neighborhood(t, source), traffic = group.userData.traffic;
  const leader = traffic.vehicles[0], follower = traffic.vehicles[2];
  traffic.vehicles = [leader, follower];
  for (const [item, distance] of [[leader, 150], [follower, 130]]) {
    item.distance = distance; item.pose = { x: -300 + distance, z: 78.7, dx: 1, dz: 0 };
  }
  for (let frame = 0; frame < 800; frame++) {
    api.tick(group, 0.05);
    assert.ok(leader.distance - follower.distance >= (leader.bodyLength + follower.bodyLength) / 2 + 3);
  }
  assert.ok(follower.distance > 330, 'takip eden araç tamamen durmamalı');
  assert.ok(follower.velocity <= leader.speed + 0.1);
});

test('kisa yolda sigmayan araclar ust uste dogmaz, yol bosalinca katilir', async t => {
  const source = { version: 1, features: [{ tags: { highway: 'residential' }, points: [[-30, 259], [0, 259], [30, 259]] }] };
  const { THREE, group } = await neighborhood(t, source), vehicles = group.userData.traffic.vehicles;
  const waiting = vehicles.filter(item => !item.spawned);
  assert.ok(waiting.length > 0);
  for (let frame = 0; frame < 600; frame++) {
    api.tick(group, 0.05);
    const active = vehicles.filter(item => item.spawned);
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++)
      assert.ok(!overlappingBodies(vehicleCorners(THREE, active[i]), vehicleCorners(THREE, active[j])));
  }
  assert.ok(waiting.some(item => item.spawned));
});

test('ucus sirasinda kotulesen hava ucagi ve mevcut izi birlikte gizler, rota degismez', async t => {
  const { THREE, group } = await neighborhood(t);
  const clear = { cloud: 0.1 }, flight = Array.from({ length: 50 }, (_, i) => flightPlan(i, clear)).find(item => item.contrail);
  group.userData.flightTime = flight.index * FLIGHT.period + FLIGHT.offset + FLIGHT.duration / 2;
  api.update(THREE, group, { daylight: 0, dusk: 0 }, new THREE.Vector3(), clear, {});
  api.tick(group, 0);
  const { airplane, contrail } = group.userData, originalPlan = airplane.userData.plan;
  assert.ok(airplane.visible && contrail.mesh.visible && airplane.userData.lights.group.visible);
  for (const bad of [{ fog: true }, { cloud: 1 }, { rain: true }, { snow: true }, { thunder: true }]) {
    api.update(THREE, group, { daylight: 0, dusk: 0 }, new THREE.Vector3(), bad, {});
    api.tick(group, 0.05);
    assert.equal(airplane.visible, false); assert.equal(contrail.mesh.visible, false);
    assert.equal(airplane.userData.lights.group.visible, false);
    assert.equal(airplane.userData.plan, originalPlan);
  }
  api.update(THREE, group, { daylight: 0, dusk: 0 }, new THREE.Vector3(), clear, {});
  api.tick(group, 0.05);
  assert.ok(airplane.visible && contrail.mesh.visible);
  assert.equal(airplane.userData.plan, originalPlan);
  group.userData.flightTime = flight.index * FLIGHT.period + FLIGHT.offset + FLIGHT.duration + 1;
  api.update(THREE, group, { daylight: 1, dusk: 0 }, new THREE.Vector3(), { fog: true }, {});
  api.tick(group, 0);
  assert.equal(airplane.visible, false); assert.equal(contrail.mesh.visible, false);
  api.tick(group, api.CONTRAIL.fadeAfter + 1);
  assert.equal(contrail.plan, null, 'gizli iz de zamaninda sönmeli');
});
