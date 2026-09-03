// Bütün koleksiyon tek salonda kalır; büyüdükçe çift yüzlü sergi duvarları eklenir.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryLayout = api;
})(typeof window === 'undefined' ? this : window, function () {
  const GAP = 2.85;
  const ROW_CAPACITY = 7;
  const AISLE_WIDTH = 4.4;
  const ART_WIDTH = 2.1, ART_HEIGHT = 2.0, EYE_HEIGHT = 1.8;

  function plan(total) {
    if (!Number.isInteger(total) || total < 1) throw new Error('En az bir eser gerekli.');
    const northCount = Math.min(3, total);
    const remaining = total - northCount;
    const neededSurfaces = remaining ? Math.ceil(remaining / ROW_CAPACITY) : 0;
    const surfaceCount = remaining ? Math.max(2, Math.ceil(neededSurfaces / 2) * 2) : 0;
    const partitionCount = Math.max(0, surfaceCount / 2 - 1);
    const rows = surfaceCount ? Math.ceil(remaining / surfaceCount) : 0;
    const width = Math.max(8, northCount * GAP + 1.8, (partitionCount + 1) * AISLE_WIDTH);
    const depth = Math.max(8, rows * GAP + 3);
    const partitions = Array.from({ length: partitionCount }, (_, index) => ({
      x: -width / 2 + (index + 1) * width / (partitionCount + 1), z: 0, length: depth - 3.2
    }));
    const slots = [];

    function addSurface(wall, count, origin, normal, axis) {
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * GAP;
        const position = axis === 'x' ? [offset, EYE_HEIGHT, origin[2]] : [origin[0], EYE_HEIGHT, offset];
        slots.push({ index: slots.length, wall, position, normal });
      }
    }

    addSurface('north', northCount, [0, 0, -depth / 2 + 0.08], [0, 0, 1], 'x');
    if (remaining) {
      const base = Math.floor(remaining / surfaceCount), extra = remaining % surfaceCount;
      const counts = Array.from({ length: surfaceCount }, (_, i) => base + (i < extra ? 1 : 0));
      const surfaces = [{ wall: 'west', x: -width / 2 + 0.08, normal: [1, 0, 0] }];
      partitions.forEach((partition, i) => {
        surfaces.push({ wall: `partition-${i}-west`, x: partition.x - 0.1, normal: [-1, 0, 0] });
        surfaces.push({ wall: `partition-${i}-east`, x: partition.x + 0.1, normal: [1, 0, 0] });
      });
      surfaces.push({ wall: 'east', x: width / 2 - 0.08, normal: [-1, 0, 0] });
      surfaces.forEach((surface, i) => addSurface(surface.wall, counts[i], [surface.x, 0, 0], surface.normal, 'z'));
    }

    const boundaries = [-width / 2, ...partitions.map(partition => partition.x), width / 2];
    const aisleCenters = boundaries.slice(0, -1).map((value, index) => (value + boundaries[index + 1]) / 2);
    const decorCenters = aisleCenters.length <= 8 ? aisleCenters : Array.from({ length: 8 }, (_, index) =>
      aisleCenters[Math.round(index * (aisleCenters.length - 1) / 7)]
    );
    const benches = total >= 4 ? decorCenters.map((x, index) => ({ x, z: index % 2 ? 1.2 : -1.2, rotation: 0 })) : [];
    const plants = [
      { x: -width / 2 + 0.72, z: depth / 2 - 0.78, rotation: 0.3 },
      { x: width / 2 - 0.72, z: depth / 2 - 0.78, rotation: -0.4 },
      { x: -width / 2 + 0.72, z: -depth / 2 + 0.78, rotation: 1.1 },
      { x: width / 2 - 0.72, z: -depth / 2 + 0.78, rotation: -1.2 }
    ];
    const obstacles = [
      ...benches.map(bench => ({ type: 'box', x: bench.x, z: bench.z, halfX: 1.12, halfZ: 0.62 })),
      ...plants.map(plant => ({ type: 'circle', x: plant.x, z: plant.z, radius: 0.55 }))
    ];
    const spawnX = aisleCenters[Math.floor(aisleCenters.length / 2)];
    return {
      count: total, start: 0, end: total, width, depth, height: 3.9, slots, partitions,
      decor: { benches, plants, chandeliers: decorCenters.map(x => ({ x, z: 0 })) },
      obstacles,
      spawn: [spawnX, 1.65, depth / 2 - 1.05]
    };
  }

  function fitArtwork(width, height) {
    if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return { width: 1.4, height: 1.8 };
    const scale = Math.min(ART_WIDTH / width, ART_HEIGHT / height);
    return { width: width * scale, height: height * scale };
  }

  return { plan, fitArtwork, ROW_CAPACITY, AISLE_WIDTH, ART_WIDTH, ART_HEIGHT, GAP };
});
