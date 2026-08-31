const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const security = require('../server/security');
const auth = require('../api/auth');
const admin = require('../api/admin');
const drive = require('../api/drive');
const adminDrive = require('../api/admin-drive');
const { checkLoginLimit } = require('../server/rate-limit');
const { listImages } = require('../server/drive');
const catalog = require('../exhibitions.json');
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
let upstreamCalls;

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  Object.assign(process.env, {
    ADMIN_PASSWORD: 'fixture-password', SESSION_SECRET: 'fixture-session-secret-at-least-32-bytes',
    APP_ORIGIN: 'https://gallery.example', GITHUB_TOKEN: 'fixture-github-token',
    GITHUB_OWNER: 'fixture-owner', GITHUB_REPO: 'fixture-repo', GITHUB_BRANCH: 'preview/fixture', GOOGLE_API_KEY: 'fixture-drive-key'
  });
  upstreamCalls = [];
  global.fetch = async (...args) => { upstreamCalls.push(args); throw new Error('Testte gerçek ağ erişimi yasak.'); };
});
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});
function response() {
  return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
}
function request(method, body, query = {}) {
  return { method, body, query, socket: { remoteAddress: crypto.randomUUID() }, headers: { origin: 'https://gallery.example', 'content-type': 'application/json' } };
}
function loggedIn(method = 'GET', body, query) {
  const res = response();
  const session = security.issueSession(res);
  const req = request(method, body, query);
  req.headers.cookie = res.headers['Set-Cookie'].split(';')[0];
  req.headers['x-csrf-token'] = session.csrf;
  return req;
}
async function call(handler, req) { const res = response(); await handler(req, res); return res; }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('Giriş token döndürmez; tarayıcı yalnızca CSRF ve oturum süresini alır', async () => {
  const res = await call(auth, request('POST', { password: process.env.ADMIN_PASSWORD }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['csrf', 'expiresAt']);
  assert.match(res.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  assert.equal(JSON.stringify(res).includes(process.env.GITHUB_TOKEN), false);
  assert.equal(upstreamCalls.length, 0);
});
test('Üretim çerezi Secure, host-sınırlı ve bir saatliktir', () => {
  process.env.NODE_ENV = 'production';
  const res = response(); security.issueSession(res);
  assert.match(res.headers['Set-Cookie'], /^__Host-gallery_session=/);
  assert.match(res.headers['Set-Cookie'], /Max-Age=3600; Secure$/);
  assert.equal(res.headers['Set-Cookie'].includes('Domain='), false);
});
test('İmzası değiştirilmiş çerez reddedilir', async () => {
  const req = loggedIn(); req.headers.cookie += 'x';
  assert.equal((await call(auth, req)).statusCode, 401);
});
test('Süresi dolan oturum reddedilir', t => {
  const req = loggedIn(); const now = Date.now();
  t.mock.method(Date, 'now', () => now + 3601000);
  assert.equal(security.getSession(req), null);
});
test('Yönetici şifresi değiştiğinde eski oturum geçersizdir', () => {
  const req = loggedIn(); process.env.ADMIN_PASSWORD = 'changed-fixture-password';
  assert.equal(security.getSession(req), null);
});
test('Anonim yönetim okuması GitHub çağrısı yapmaz', async () => {
  assert.equal((await call(admin, request('GET', undefined, { path: 'exhibitions.json' }))).statusCode, 401);
  assert.equal(upstreamCalls.length, 0);
});
test('Kaynak ve CSRF doğrulaması geçmeden kayıt yapılamaz', async () => {
  for (const mode of ['origin', 'csrf', 'missing-origin']) {
    const req = loggedIn('PUT', { path: 'exhibitions.json', data: catalog, sha: 'a'.repeat(40) });
    if (mode === 'origin') req.headers.origin = 'https://other.example';
    if (mode === 'csrf') delete req.headers['x-csrf-token'];
    if (mode === 'missing-origin') delete req.headers.origin;
    assert.equal((await call(admin, req)).statusCode, 403);
  }
  assert.equal(upstreamCalls.length, 0);
});
test('Giriş isteği de yabancı kaynakta reddedilir', async () => {
  const req = request('POST', { password: process.env.ADMIN_PASSWORD }); req.headers.origin = 'https://other.example';
  assert.equal((await call(auth, req)).statusCode, 403);
});
test('İzin verilmeyen dosya yolları engellenir', async () => {
  for (const path of ['api/auth.js', '../config.json', '.env', ['config.json']]) {
    assert.equal((await call(admin, loggedIn('GET', undefined, { path }))).statusCode, 400);
  }
  assert.equal(upstreamCalls.length, 0);
});
test('Eksik SHA ile kayıt GitHub’a gönderilmez', async () => {
  const res = await call(admin, loggedIn('PUT', { path: 'exhibitions.json', data: catalog }));
  assert.equal(res.statusCode, 428); assert.equal(upstreamCalls.length, 0);
});
test('Çakışma halinde eski SHA aynen gönderilir; yeni SHA alınarak üzerine yazılmaz', async () => {
  global.fetch = async (url, init) => { upstreamCalls.push([url, init]); return json({}, 409); };
  const res = await call(admin, loggedIn('PUT', { path: 'exhibitions.json', data: catalog, sha: 'a'.repeat(40) }));
  assert.equal(res.statusCode, 409);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0][1].method, 'PUT');
  assert.equal(JSON.parse(upstreamCalls[0][1].body).sha, 'a'.repeat(40));
});
test('Başarılı kayıt yeni SHA verir; yayın tamamlandı iddiasında bulunmaz', async () => {
  global.fetch = async () => json({ content: { sha: 'b'.repeat(40) } });
  const res = await call(admin, loggedIn('PUT', { path: 'exhibitions.json', data: catalog, sha: 'a'.repeat(40) }));
  assert.deepEqual(res.body, { sha: 'b'.repeat(40), status: 'saved', publication: 'pending' });
});
test('GitHub okuma hatası boş sergi listesine dönüşmez', async () => {
  for (const status of [404, 403, 500]) {
    global.fetch = async () => json({ message: 'fixture-sensitive-upstream-detail' }, status);
    const res = await call(admin, loggedIn('GET', undefined, { path: 'exhibitions.json' }));
    assert.equal(res.statusCode, 502); assert.equal(res.body.data, undefined);
    assert.equal(JSON.stringify(res).includes('fixture-sensitive-upstream-detail'), false);
  }
});
test('Önizleme ortamında main içeriğine erişim kapalıdır', async () => {
  process.env.VERCEL_ENV = 'preview'; process.env.GITHUB_BRANCH = 'main';
  assert.equal((await call(admin, loggedIn('GET', undefined, { path: 'exhibitions.json' }))).statusCode, 503);
  assert.equal(upstreamCalls.length, 0);
});
test('Geçersiz şema ve çok büyük gövde engellenir', async () => {
  assert.equal((await call(admin, loggedIn('PUT', { path: 'exhibitions.json', sha: 'a'.repeat(40), data: [...catalog, ...catalog] }))).statusCode, 400);
  assert.equal((await call(auth, request('POST', { password: 'x'.repeat(600000) }))).statusCode, 413);
  assert.equal(upstreamCalls.length, 0);
});
test('Yerel giriş denemeleri beş istekten sonra sınırlanır', async () => {
  const req = request('POST', { password: 'wrong-fixture-password' });
  for (let i = 0; i < 5; i++) assert.equal((await call(auth, req)).statusCode, 401);
  assert.equal((await call(auth, req)).statusCode, 429);
});
test('Üretimde eksik Firewall kuralı girişe izin vermez', async () => {
  Object.assign(process.env, { NODE_ENV: 'production', VERCEL: '1', VERCEL_URL: 'fixture.vercel.app' });
  global.fetch = async url => { upstreamCalls.push(url); return json({}, 404); };
  const req = request('POST'); req.headers.host = 'attacker.example'; req.headers['x-real-ip'] = '192.0.2.1';
  await assert.rejects(checkLoginLimit(req), { status: 503 });
  assert.match(upstreamCalls[0], /^https:\/\/fixture\.vercel\.app\//);
});
test('Anonim Drive erişimi yalnızca yayımlanan klasörlere açıktır; indirme vekili kapalıdır', async () => {
  assert.equal((await call(drive, request('GET', undefined, { action: 'list', folderId: 'unlisted-folder' }))).statusCode, 404);
  assert.equal((await call(drive, request('GET', undefined, { action: 'download', fileId: 'some-file-id' }))).statusCode, 400);
  assert.equal((await call(adminDrive, request('GET', undefined, { folderId: 'new-folder-id' }))).statusCode, 401);
  assert.equal(upstreamCalls.length, 0);
});
test('Drive başarısız veya eksik liste döndürdüğünde boş listeyle devam edilmez', async () => {
  global.fetch = async () => json({}, 503);
  await assert.rejects(listImages(catalog[0].driveFolderId), { status: 502 });
  global.fetch = async () => json({ files: [], nextPageToken: 'repeated-page' });
  await assert.rejects(listImages(catalog[0].driveFolderId), { status: 422 });
});
test('Drive listesi sayfalanır; başarılı anonim yanıt kısa süre önbelleklenir', async () => {
  let calls = 0;
  global.fetch = async () => json(++calls === 1 ? { files: [{ id: 'fixture-image-a', name: 'A', mimeType: 'image/jpeg' }], nextPageToken: 'next' } : { files: [{ id: 'fixture-image-b', name: 'B', mimeType: 'image/png' }] });
  const res = await call(drive, request('GET', undefined, { action: 'list', folderId: catalog[0].driveFolderId }));
  assert.equal(res.statusCode, 200); assert.equal(res.body.files.length, 2);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=0, s-maxage=60');
});
