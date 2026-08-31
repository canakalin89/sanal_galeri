const { test } = require('node:test');
const assert = require('node:assert/strict');
const { updateExhibition } = require('../admin-state');
const { validateDocument, LIMITS } = require('../server/validation');

test('Drive’da görünmeyen eserin açıklaması kayıtta korunur; eski anlık görüntü değişmez', () => {
  const ex = { id: 'sergi', name: 'Eski ad', driveFolderId: 'fixture-folder', images: {
    'fixture-visible': { title: 'Eski başlık' }, 'fixture-missing': { artist: 'Korunacak sanatçı' }
  } };
  const before = JSON.stringify(ex);
  const updated = updateExhibition(ex, { name: 'Yeni ad' }, [{ id: 'fixture-visible', title: 'Yeni başlık' }]);
  assert.equal(updated.images['fixture-missing'].artist, 'Korunacak sanatçı');
  assert.equal(updated.images['fixture-visible'].title, 'Yeni başlık');
  assert.equal(JSON.stringify(ex), before);
  validateDocument('exhibitions.json', [updated]);
});
test('Kullanıcının açıkça boşalttığı eser alanları silinir; diğer eserler korunur', () => {
  const ex = { images: { 'fixture-one': { title: 'Silinecek' }, 'fixture-two': { title: 'Kalacak' } } };
  const updated = updateExhibition(ex, { name: 'Sergi' }, [{ id: 'fixture-one', title: '', caption: '', artist: '' }]);
  assert.equal(updated.images['fixture-one'], undefined);
  assert.equal(updated.images['fixture-two'].title, 'Kalacak');
});
test('Kayıtlı gerçek katalog geçerlidir ve sınır aşımı reddedilir', () => {
  const catalog = require('../exhibitions.json');
  validateDocument('exhibitions.json', catalog);
  assert.throws(() => validateDocument('config.json', { schoolName: 'x'.repeat(LIMITS.name + 1) }), { status: 400 });
});
