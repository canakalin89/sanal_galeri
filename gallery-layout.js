// Tek tasarım sistemi: büyük koleksiyonlar sınırlı boyutta, dengeli salonlara ayrılır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryLayout = api;
})(typeof window === 'undefined' ? this : window, function () {
  const ROOM_CAPACITY = 12;
  const GAP = 2.85;
  const ART_WIDTH = 2.1, ART_HEIGHT = 2.0, EYE_HEIGHT = 1.8;
  function plan(total, roomIndex = 0) {
    if (!Number.isInteger(total) || total < 1) throw new Error('En az bir eser gerekli.');
    const roomCount = Math.ceil(total / ROOM_CAPACITY);
    if (!Number.isInteger(roomIndex) || roomIndex < 0 || roomIndex >= roomCount) throw new Error('Geçersiz salon.');
    const base = Math.floor(total / roomCount), extra = total % roomCount;
    const count = base + (roomIndex < extra ? 1 : 0);
    const start = roomIndex * base + Math.min(roomIndex, extra);
    const north = count <= 3 ? count : Math.ceil(count / 3);
    const east = Math.ceil((count - north) / 2), west = count - north - east;
    const width = Math.max(8, north * GAP + 1.8);
    const depth = Math.max(8, Math.max(east, west) * GAP + 3);
    const slots = [];
    const wall = (name, length, normal) => {
      for (let i = 0; i < length; i++) {
        const offset = (i - (length - 1) / 2) * GAP;
        const position = name === 'north' ? [offset, EYE_HEIGHT, -depth / 2 + 0.08]
          : [name === 'east' ? width / 2 - 0.08 : -width / 2 + 0.08, EYE_HEIGHT, (name === 'east' ? offset : -offset) - 0.4];
        slots.push({ index: start + slots.length, wall: name, position, normal });
      }
    };
    wall('north', north, [0, 0, 1]);
    wall('east', east, [-1, 0, 0]);
    wall('west', west, [1, 0, 0]);
    return { roomIndex, roomCount, start, end: start + count, count, width, depth, height: 3.9, slots, spawn: [0, 1.65, depth / 2 - 2] };
  }
  function fitArtwork(width, height) {
    if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return { width: 1.4, height: 1.8 };
    const scale = Math.min(ART_WIDTH / width, ART_HEIGHT / height);
    return { width: width * scale, height: height * scale };
  }
  return { plan, fitArtwork, ROOM_CAPACITY, ART_WIDTH, ART_HEIGHT, GAP };
});
