const { endpoint, requireSession, requireCsrf, jsonBody } = require('../server/security');
const { readDocument, writeDocument } = require('../server/github');
module.exports = endpoint(async (req, res) => {
  const session = requireSession(req);
  if (req.method === 'GET') return res.json(await readDocument(req.query.path));
  requireCsrf(req, session);
  const { path, data, sha } = jsonBody(req);
  return res.json(await writeDocument(path, data, sha));
}, ['GET', 'PUT']);
