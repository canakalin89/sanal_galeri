const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SITE, selectFeatures, buildingHeight } = require('../gallery-neighborhood');
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
