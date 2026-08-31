const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient, validateCatalog, validateFiles, CACHE_MS } = require('../gallery-data');
const files = [{ id: 'fixture-image' }];
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test('Kart ile galeri aynı klasörü isterse tek ağ çağrısını paylaşır', async () => {
  let calls = 0, release;
  const client = createClient({ fetchImpl: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const card = client.getFiles('fixture-folder');
  const gallery = client.getFiles('fixture-folder', true);
  assert.equal(card, gallery);
  await Promise.resolve();
  assert.equal(calls, 1);
  release(response({ files }));
  assert.deepEqual(await gallery, files);
});

test('Başarı kısa süre önbelleklenir; süre dolması ve Yenile yeni okuma başlatır', async () => {
  let time = 0, calls = 0;
  const client = createClient({ now: () => time, fetchImpl: async () => { calls++; return response({ files }); } });
  await client.getFiles('fixture-folder');
  time = CACHE_MS - 1;
  await client.getFiles('fixture-folder');
  assert.equal(calls, 1);
  time = CACHE_MS;
  await client.getFiles('fixture-folder');
  assert.equal(calls, 2);
  await client.getFiles('fixture-folder', true);
  assert.equal(calls, 3);
});

test('HTTP hatası boş katalog olarak saklanmaz; tekrar deneme başarılı olabilir', async () => {
  let calls = 0;
  const client = createClient({ fetchImpl: async () => ++calls === 1 ? response({}, 503) : response([]) });
  await assert.rejects(client.getCatalog(), /alınamadı/);
  assert.deepEqual(await client.getCatalog(), []);
  assert.equal(calls, 2);
});

test('Bozuk JSON ve eksik dosya listesi önbelleğe girmez', async () => {
  let calls = 0;
  const client = createClient({ fetchImpl: async () => {
    calls++;
    if (calls === 1) return { ok: true, json: async () => { throw new SyntaxError(); } };
    return response(calls === 2 ? {} : { files });
  } });
  await assert.rejects(client.getFiles('fixture-folder'), /geçerli bir yanıt/);
  await assert.rejects(client.getFiles('fixture-folder'), /doğrulanamadı/);
  assert.deepEqual(await client.getFiles('fixture-folder'), files);
});

test('Geçersiz veya yinelenen kayıtlar gerçek boş listeden ayrılır', () => {
  assert.deepEqual(validateFiles({ files: [] }), []);
  assert.throws(() => validateFiles({ files: [files[0], files[0]] }));
  assert.throws(() => validateFiles({ files: [{ id: 'bad?url' }] }));
  assert.throws(() => validateCatalog({}));
  const ex = { id: 'sergi', name: 'Sergi', driveFolderId: 'fixture-folder', images: {} };
  assert.throws(() => validateCatalog([ex, ex]));
  assert.throws(() => validateCatalog([{ ...ex, description: {} }]));
  assert.deepEqual(validateCatalog(require('../exhibitions.json')), require('../exhibitions.json'));
});

test('Zaman aşımı beklemeyi bitirir; geç kalan eski yanıt yeni sonucu değiştirmez', async () => {
  let release, signal, calls = 0;
  const client = createClient({ timeoutMs: 15, fetchImpl: async (url, options) => {
    if (++calls > 1) return response({ files });
    signal = options.signal;
    return new Promise(resolve => { release = resolve; });
  } });
  await assert.rejects(client.getFiles('fixture-folder'), /zaman aşımı/);
  assert.equal(signal.aborted, true);
  assert.deepEqual(await client.getFiles('fixture-folder'), files);
  release(response({ files: [] }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await client.getFiles('fixture-folder'), files);
  assert.equal(calls, 2);
});

test('Yanıt gövdesi takılırsa da zaman aşımı uygulanır', async () => {
  const client = createClient({ timeoutMs: 15, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  await assert.rejects(client.getCatalog(), /zaman aşımı/);
});

test('Geçersiz klasör kimliği ağ isteği yapmaz', async () => {
  const client = createClient({ fetchImpl: () => { assert.fail('Ağ çağrısı yapılmamalı'); } });
  await assert.rejects(client.getFiles('x&other=1'), /geçersiz/);
});
