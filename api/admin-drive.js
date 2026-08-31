const { endpoint, requireSession } = require('../server/security');
const { listImages } = require('../server/drive');
module.exports = endpoint(async (req, res) => {
  requireSession(req);
  return res.json({ files: await listImages(req.query.folderId) });
}, ['GET']);
