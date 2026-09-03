const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plan, fitArtwork, ROW_CAPACITY, AISLE_WIDTH, GAP, ART_WIDTH, ART_HEIGHT } = require('../gallery-layout');

test('1–2000 eserin tamamı tek salon planında bir kez yer alır', () => {
  for (const total of [1, 2, 3, 4, 7, 12, 13, 24, 28, 101, 2000]) {
    const layout = plan(total);
    assert.equal(layout.count, total);
    assert.deepEqual(layout.slots.map(slot => slot.index), Array.from({ length: total }, (_, i) => i));
    assert.ok(layout.depth <= ROW_CAPACITY * GAP + 3 + 1e-9);
    assert.ok(layout.partitions.every(partition => partition.length < layout.depth));
    assert.ok(layout.decor.benches.length <= 8 && layout.decor.chandeliers.length <= 8);
    assert.ok(layout.obstacles.every(obstacle => Math.abs(obstacle.x) < layout.width / 2 && Math.abs(obstacle.z) < layout.depth / 2));
  }
  assert.equal(plan(28).partitions.length, 1);
});

test('İç sergi duvarları dengeli koridorlar kurar; eserler yüzey sınırlarında kalır', () => {
  for (let total = 1; total <= 120; total++) {
    const layout = plan(total);
    const boundaries = [-layout.width / 2, ...layout.partitions.map(partition => partition.x), layout.width / 2];
    for (let i = 1; i < boundaries.length; i++) assert.ok(boundaries[i] - boundaries[i - 1] >= AISLE_WIDTH - 1e-9);
    assert.ok(Math.abs(layout.spawn[0]) < layout.width / 2 - 0.6);
    assert.ok(Math.abs(layout.spawn[2]) < layout.depth / 2 - 0.6);
    assert.ok(!layout.partitions.some(partition =>
      Math.abs(layout.spawn[0] - partition.x) < 0.58 && Math.abs(layout.spawn[2] - partition.z) < partition.length / 2 + 0.48
    ));
    assert.ok(!layout.obstacles.some(obstacle => obstacle.type === 'box'
      ? Math.abs(layout.spawn[0] - obstacle.x) < obstacle.halfX + 0.38 && Math.abs(layout.spawn[2] - obstacle.z) < obstacle.halfZ + 0.38
      : Math.hypot(layout.spawn[0] - obstacle.x, layout.spawn[2] - obstacle.z) < obstacle.radius + 0.38
    ));
    for (const slot of layout.slots) {
      assert.ok(slot.position[1] - ART_HEIGHT / 2 - 0.4 > 0);
      assert.ok(slot.position[1] + ART_HEIGHT / 2 + 0.12 < layout.height - 0.5);
      const coordinate = slot.wall === 'north' ? slot.position[0] : slot.position[2];
      const half = slot.wall === 'north' ? layout.width / 2 : layout.depth / 2;
      assert.ok(Math.abs(coordinate) + ART_WIDTH / 2 + 0.12 < half - 0.5);
      assert.notEqual(slot.wall, 'south');
    }
    for (let i = 0; i < layout.slots.length; i++) for (let j = i + 1; j < layout.slots.length; j++) {
      if (layout.slots[i].wall !== layout.slots[j].wall) continue;
      const a = layout.slots[i].position, b = layout.slots[j].position;
      assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) >= GAP - 1e-9);
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

test('Tek salon planı deterministiktir ve geçersiz eser sayısı reddedilir', () => {
  assert.deepEqual(plan(28), plan(28));
  for (const total of [0, -1, 1.5]) assert.throws(() => plan(total));
});
