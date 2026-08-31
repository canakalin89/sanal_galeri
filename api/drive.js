const { endpoint, HttpError } = require('../server/security');
const { listImages } = require('../server/drive');
const exhibitions = require('../exhibitions.json');
module.exports = endpoint(async (req, res) => {
  const { action, folderId } = req.query;
  if (action !== 'list') throw new HttpError(400, 'Yalnızca görsel listeleme destekleniyor.');
  // Ziyaretçiler yalnızca bu yayında bulunan sergilerin klasörlerini okuyabilir.
  if (typeof folderId !== 'string' || !exhibitions.some(ex => ex.driveFolderId === folderId)) throw new HttpError(404, 'Sergi bulunamadı.');
  const files = await listImages(folderId);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  return res.json({ files });
}, ['GET']);
