const { test } = require('node:test');
const assert = require('node:assert/strict');
const { profile, dayCycle } = require('../gallery-lighting');

test('mobil aydinlatma butcesi piksel, golge ve isik sayisini sinirlar', () => {
  const mobile = profile({ isMobile: true, devicePixelRatio: 3, width: 12, depth: 20 });
  assert.equal(mobile.pixelRatio, 1.35);
  assert.equal(mobile.shadowMapSize, 1024);
  assert.equal(mobile.ceilingLightCount, 2);
  assert.equal(mobile.pointLightCount, 1);
});

test('masaustu profili kucuk salonda daha yumusak golge kalitesi kullanir', () => {
  const desktop = profile({ isMobile: false, devicePixelRatio: 2, width: 12, depth: 20 });
  assert.equal(desktop.pixelRatio, 1.75);
  assert.equal(desktop.shadowMapSize, 2048);
  assert.equal(desktop.ceilingLightCount, 3);
  assert.ok(desktop.shadowExtent >= 11.5);
  assert.equal(desktop.shadowRadius, 4);
});

test('cok buyuk prosedurel salonlarda GPU butcesi sinirsiz buyumez', () => {
  const large = profile({ isMobile: false, devicePixelRatio: 1, width: 200, depth: 20 });
  assert.equal(large.shadowMapSize, 1024);
  assert.equal(large.ceilingLightCount, 4);
  assert.equal(large.pointLightCount, 3);
  assert.equal(large.shadowExtent, 32);
});

test('gercek saat dongusu oglen dogal isigi, gece ic aydinlatmayi one cikarir', () => {
  const morning = dayCycle(new Date(2026, 5, 1, 8, 0));
  const noon = dayCycle(new Date(2026, 5, 1, 12, 0));
  const evening = dayCycle(new Date(2026, 5, 1, 17, 0));
  const midnight = dayCycle(new Date(2026, 5, 1, 0, 0));
  assert.ok(noon.sunIntensity > morning.sunIntensity && morning.sunIntensity > midnight.sunIntensity);
  assert.ok(midnight.interiorFactor > noon.interiorFactor);
  assert.ok(morning.sunX < 0 && evening.sunX > 0);
  assert.equal(midnight.label, 'Gece');
});
