const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plan, fitArtwork, ROOM_CAPACITY, GAP, ART_WIDTH, ART_HEIGHT } = require('../gallery-layout');

test('1–2000 eser dengeli salonlara ayrılır; hiçbir eser eksilmez veya tekrarlanmaz', () => {
  for (const total of [1, 2, 3, 4, 7, 12, 13, 24, 28, 101, 2000]) {
    const plans = Array.from({ length: plan(total).roomCount }, (_, index) => plan(total, index));
    assert.ok(plans.every(p => p.count <= ROOM_CAPACITY && p.count > 0));
    assert.ok(Math.max(...plans.map(p => p.count)) - Math.min(...plans.map(p => p.count)) <= 1);
    assert.deepEqual(plans.flatMap(p => p.slots.map(s => s.index)), Array.from({ length: total }, (_, i) => i));
    assert.ok(plans.every(p => p.width <= 13.2 + 1e-9 && p.depth <= 14.4 + 1e-9));
  }
  assert.deepEqual([plan(28, 0).count, plan(28, 1).count, plan(28, 2).count], [10, 9, 9]);
});

test('Eserler köşelerden, girişten ve birbirinden uzakta; başlangıç içeride kalır', () => {
  for (let total = 1; total <= 60; total++) {
    for (let room = 0; room < plan(total).roomCount; room++) {
      const p = plan(total, room);
      assert.ok(Math.abs(p.spawn[0]) < p.width / 2 - 0.6);
      assert.ok(Math.abs(p.spawn[2]) < p.depth / 2 - 0.6);
      for (const slot of p.slots) {
        assert.ok(slot.position[1] - ART_HEIGHT / 2 - 0.4 > 0);
        assert.ok(slot.position[1] + ART_HEIGHT / 2 + 0.12 < p.height - 0.5);
        const coordinate = slot.wall === 'north' ? slot.position[0] : slot.position[2];
        const half = slot.wall === 'north' ? p.width / 2 : p.depth / 2;
        assert.ok(Math.abs(coordinate) + ART_WIDTH / 2 + 0.12 < half - 0.5);
        assert.notEqual(slot.wall, 'south');
      }
      for (let i = 0; i < p.slots.length; i++) for (let j = i + 1; j < p.slots.length; j++) {
        if (p.slots[i].wall !== p.slots[j].wall) continue;
        const a = p.slots[i].position, b = p.slots[j].position;
        assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) >= GAP - 1e-9);
      }
    }
  }
});

test('Portre, kare ve panorama kırpılmadan aynı eser alanına sığar', () => {
  for (const [w, h] of [[400, 800], [800, 400], [1000, 1000], [12000, 300], [300, 12000]]) {
    const fitted = fitArtwork(w, h);
    assert.ok(fitted.width <= ART_WIDTH + 1e-9 && fitted.height <= ART_HEIGHT + 1e-9);
    assert.ok(Math.abs(fitted.width / fitted.height - w / h) < 1e-9);
  }
  assert.deepEqual(fitArtwork(0, 0), { width: 1.4, height: 1.8 });
});

test('Salon planı deterministiktir ve geçersiz salon seçimi reddedilir', () => {
  assert.deepEqual(plan(28, 1), plan(28, 1));
  for (const args of [[0], [-1], [1.5], [12, 1], [28, -1]]) assert.throws(() => plan(...args));
});
