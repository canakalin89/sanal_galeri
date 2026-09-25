const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SITE, selectFeatures, buildingHeight, trafficRoutes, trafficPhase, flightProgress, flightIndex, flightPlan, flightPosition, contrailChance, flightLightState, FLIGHT } = require('../gallery-neighborhood');
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

test('araclar yol bitiminde geri sekmez; gorus disinda yeni tur baslar', () => {
  assert.ok(trafficPhase(20, 1, 100, 0, 1) < trafficPhase(21, 1, 100, 0, 1));
  assert.ok(trafficPhase(20, 1, 100, 0, -1) > trafficPhase(21, 1, 100, 0, -1));
  assert.equal(trafficPhase(100, 1, 100, 0, 1), 0);
  assert.equal(trafficPhase(100, 1, 100, 0, -1), 1);
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
