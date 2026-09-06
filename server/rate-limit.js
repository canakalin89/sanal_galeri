const { HttpError, isLocal } = require('./security');
const { checkRateLimit } = require('@vercel/firewall');
const attempts = new Map();
const LOGIN_LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;
async function checkLoginLimit(req) {
  if (isLocal()) {
    // Yalnızca yerel geliştirme: dağıtık üretim sınırı yerine kullanılamaz.
    const key = req.socket?.remoteAddress || 'local';
    const now = Date.now();
    for (const [ip, record] of attempts) if (record.until <= now) attempts.delete(ip);
    const record = attempts.get(key) || { count: 0, until: now + WINDOW_MS };
    if (++record.count > LOGIN_LIMIT) throw new HttpError(429, 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.');
    attempts.set(key, record);
    return;
  }
  if (!process.env.VERCEL || process.env.NODE_ENV !== 'production' || !process.env.VERCEL_URL) {
    throw new HttpError(503, 'Üretim giriş hız sınırı yapılandırılmamış.');
  }
  let result;
  let timer;
  try {
    // requireOrigin bu noktadan önce çalışır; SDK kuralı isteğin geldiği aynı proje alanında arar.
    const firewallHost = new URL(req.headers.origin).host;
    const forwarded = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for'];
    const clientIp = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0]).trim();
    if (!clientIp || clientIp.length > 128) throw new Error('client-ip-missing');
    const headers = { ...req.headers, host: firewallHost, 'x-real-ip': clientIp };
    result = await Promise.race([
      checkRateLimit('gallery-admin-login', { headers, rateLimitKey: clientIp }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000); })
    ]);
  } catch { throw new HttpError(503, 'Giriş korumasına ulaşılamadı. Daha sonra tekrar deneyin.'); }
  finally { clearTimeout(timer); }
  if (result.error === 'not-found') throw new HttpError(503, 'Giriş hız sınırı kuralı yapılandırılmamış.');
  if (result.rateLimited || result.error) throw new HttpError(429, 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.');
}
module.exports = { checkLoginLimit };
