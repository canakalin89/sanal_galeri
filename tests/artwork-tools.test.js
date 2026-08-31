const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterImages, artists, parseRoute, artworkHash, shareUrl, pickedArtworkIndex } = require('../artwork-tools');
const images = [
  { id: 'fixture-one', title: 'İstanbul Işıkları', artist: 'Çağrı', caption: 'Gece manzarası' },
  { id: 'fixture-two', title: 'Deniz', artist: 'İpek', caption: 'İstanbul kıyısı' },
  { id: 'fixture-three', fileName: 'Okul Çizimi.png', artist: null }
];

test('Türkçe ve aksansız arama başlık, açıklama, sanatçı ve dosya adını bulur', () => {
  assert.deepEqual(filterImages(images, 'ISTANBUL isiklari').map(x => x.id), ['fixture-one']);
  assert.deepEqual(filterImages(images, 'cagri gece').map(x => x.id), ['fixture-one']);
  assert.deepEqual(filterImages(images, 'okul cizimi').map(x => x.id), ['fixture-three']);
  assert.equal(filterImages(images, '   ').length, 3);
  assert.equal(filterImages(images, 'bulunmayan').length, 0);
});

test('Sanatçı ve metin filtreleri birlikte uygulanır, kaynak sırası ve kimliği korunur', () => {
  const before = JSON.stringify(images);
  const result = filterImages(images, 'istanbul', 'İpek');
  assert.deepEqual(result.map(x => x.id), ['fixture-two']);
  assert.equal(result[0], images[1]);
  assert.equal(JSON.stringify(images), before);
  assert.deepEqual(artists([...images, { artist: ' İpek ' }]), ['Çağrı', 'İpek']);
});

test('Mevcut sergi bağlantıları ve yeni eser bağlantıları birlikte okunur', () => {
  assert.deepEqual(parseRoute('#hat-sergisi'), { id: 'hat-sergisi', artworkId: null, invalid: false });
  const hash = artworkHash('hat-sergisi', 'fixture-two');
  assert.deepEqual(parseRoute(hash), { id: 'hat-sergisi', artworkId: 'fixture-two', invalid: false });
  // Eserin konumu değişse de URL aynı kimliği bulur.
  assert.equal([...images].reverse().find(x => x.id === parseRoute(hash).artworkId).title, 'Deniz');
});

test('Paylaşım gömme ve takip parametrelerini kaldırır; eser kimliğini korur', () => {
  assert.equal(shareUrl('https://example.test/?embed=1&utm_source=test#eski', 'hat-sergisi', 'fixture-one'),
    'https://example.test/#hat-sergisi?eser=fixture-one');
});

test('Bozuk veya kod içerebilecek eser bağlantıları reddedilir', () => {
  for (const hash of ['#hat?eser=', '#hat?eser=%22%3E', '#?eser=fixture-one', '#bad/id?eser=fixture-one']) assert.equal(parseRoute(hash).invalid, true);
  assert.throws(() => artworkHash('bad/id', 'fixture-one'));
  assert.throws(() => artworkHash('hat', 'bad?id'));
});

test('3D seçim çerçeveden eseri bulur; en öndeki duvarın arkasını seçmez', () => {
  const frame = { userData: { imgData: images[1] } };
  const canvas = { userData: {}, parent: frame };
  assert.equal(pickedArtworkIndex([{ object: canvas }], images), 1);
  assert.equal(pickedArtworkIndex([{ object: { userData: {} } }, { object: canvas }], images), -1);
  assert.equal(pickedArtworkIndex([], images), -1);
  assert.equal(pickedArtworkIndex([{ object: canvas }], [images[0]]), -1);
});
