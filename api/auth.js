const { endpoint, HttpError, requireOrigin, requireSession, requireCsrf, jsonBody, equal, issueSession, setCookie } = require('../server/security');
const { checkLoginLimit } = require('../server/rate-limit');
module.exports = endpoint(async (req, res) => {
  if (req.method === 'GET') {
    const session = requireSession(req);
    return res.json({ csrf: session.csrf, expiresAt: session.exp });
  }
  if (req.method === 'DELETE') {
    requireCsrf(req, requireSession(req));
    setCookie(res, '', 0);
    return res.json({ ok: true });
  }
  requireOrigin(req);
  const body = jsonBody(req);
  if (typeof body.password !== 'string' || body.password.length > 1024) throw new HttpError(400, 'Geçersiz şifre.');
  await checkLoginLimit(req);
  if (!process.env.ADMIN_PASSWORD) throw new HttpError(503, 'Yönetim girişi yapılandırılmamış.');
  if (!equal(body.password, process.env.ADMIN_PASSWORD)) throw new HttpError(401, 'Yanlış şifre.');
  const session = issueSession(res);
  return res.json({ csrf: session.csrf, expiresAt: session.exp });
}, ['GET', 'POST', 'DELETE']);
