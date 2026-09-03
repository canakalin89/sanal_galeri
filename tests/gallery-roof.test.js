const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plan } = require('../gallery-layout');
const { layout, surfaceHeight, confineParticle } = require('../gallery-roof');

test('cam tavan 1-2000 eser icin acik alanlari ve tasiyici araliklarini korur', () => {
  for (const total of [1,3,12,28,100,2000]) {
    const room = plan(total), roof = layout(room);
    assert.equal(roof.bays.length, room.partitions.length + 1);
    assert.ok(roof.ridgeHeight > room.height && roof.ridgeHeight <= room.height + 1.26);
    assert.ok(roof.rafters.some(z => Math.abs(z) < 0.000001));
    let glassArea = 0;
    for (const bay of roof.bays) {
      assert.ok(bay.minX > -room.width/2 && bay.maxX < room.width/2 && bay.maxX > bay.minX);
      glassArea += (bay.maxX - bay.minX) * roof.halfDepth * 2;
    }
    assert.ok(glassArea / (room.width * room.depth) > 0.55);
    for (let i=1;i<roof.rafters.length;i++) assert.ok(roof.rafters[i]-roof.rafters[i-1] <= 3.01);
  }
});

test('ruzgarla kayan yagis cam egiminin ya da opak bandin altina giremez', () => {
  for (const count of [1,28,2000]) {
    const roof = layout(plan(count));
    for (const bay of roof.bays) {
      assert.equal(surfaceHeight(roof, bay.centerX, 0), roof.base + bay.rise);
      assert.ok(Math.abs(surfaceHeight(roof, bay.minX, 0) - roof.base) < 0.000001);
      const particle = { x: bay.centerX, y: roof.base - 2, z: 0 };
      confineParticle(roof, particle);
      assert.ok(particle.y > roof.ridgeHeight);
    }
    const windblown = { x: roof.width * 3, z: -roof.depth * 2, y: 0 };
    confineParticle(roof, windblown);
    assert.ok(Math.abs(windblown.x) <= roof.width/2 && Math.abs(windblown.z) <= roof.depth/2);
    assert.ok(windblown.y > roof.ridgeHeight);
  }
});
