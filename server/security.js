const crypto = require('node:crypto');
const SESSION_SECONDS = 3600;
const MAX_BODY_BYTES = 512 * 1024;
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function isLocal() { return !process.env.VERCEL && ['development', 'test'].includes(process.env.NODE_ENV); }
function cookieName() { return isLocal() ? 'gallery_session' : '__Host-gallery_session'; }
function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || !process.env.ADMIN_PASSWORD) throw new HttpError(503, 'Yönetim oturumu yapılandırılmamış.');
  // Şifre değişikliği eski oturumları da geçersiz kılar.
  return crypto.createHmac('sha256', secret).update(process.env.ADMIN_PASSWORD).digest();
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hash = value => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}
function sign(payload) { return crypto.createHmac('sha256', sessionKey()).update(payload).digest('base64url'); }
function setCookie(res, value, seconds) {
  res.setHeader('Set-Cookie', `${cookieName()}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${isLocal() ? '' : '; Secure'}`);
}
function issueSession(res) {
  const session = { exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, csrf: crypto.randomBytes(32).toString('base64url') };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  setCookie(res, `${payload}.${sign(payload)}`, SESSION_SECONDS);
  return session;
}
function getSession(req) {
  const values = String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(x => x.startsWith(cookieName() + '='));
  if (values.length !== 1) return null;
  const value = values[0].slice(cookieName().length + 1);
  if (value.length > 1024) return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !equal(parts[1], sign(parts[0]))) return null;
  try {
    const session = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(session.exp) || session.exp <= now || session.exp > now + SESSION_SECONDS || typeof session.csrf !== 'string' || !/^[\w-]{43}$/.test(session.csrf)) return null;
    return session;
  } catch { return null; }
}
function requireSession(req) {
  const session = getSession(req);
  if (!session) throw new HttpError(401, 'Oturum sona erdi. Yeniden giriş yapın.');
  return session;
}
function requireOrigin(req) {
  const allowed = new Set();
  if (process.env.APP_ORIGIN) allowed.add(new URL(process.env.APP_ORIGIN).origin);
  if (process.env.VERCEL_URL) allowed.add('https://' + process.env.VERCEL_URL);
  if (isLocal()) { allowed.add('http://localhost:4173'); allowed.add('http://127.0.0.1:4173'); }
  if (!allowed.has(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'İsteğin kaynağı doğrulanamadı.');
}
function requireCsrf(req, session) {
  requireOrigin(req);
  if (!equal(req.headers['x-csrf-token'], session.csrf)) throw new HttpError(403, 'İşlem doğrulanamadı. Sayfayı yenileyin.');
}
function jsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'JSON içerik gerekli.');
  let body = req.body;
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw new HttpError(413, 'İstek çok büyük.');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new HttpError(413, 'İstek çok büyük.');
    try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Geçersiz JSON.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Geçersiz istek.');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) throw new HttpError(413, 'İstek çok büyük.');
  return body;
}
function endpoint(handler, methods) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ error: 'Yöntem desteklenmiyor.' });
    }
    try { return await handler(req, res); }
    catch (err) {
      // Üst servis hataları anahtar içerebilir; dışarı aktarılmaz.
      return res.status(err instanceof HttpError ? err.status : 502).json({ error: err instanceof HttpError ? err.message : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.' });
    }
  };
}
module.exports = { HttpError, SESSION_SECONDS, MAX_BODY_BYTES, isLocal, equal, setCookie, issueSession, getSession, requireSession, requireOrigin, requireCsrf, jsonBody, endpoint };
