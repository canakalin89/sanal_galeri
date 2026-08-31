const { HttpError } = require('./security');
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const SHA = /^[a-f0-9]{40}$/;
const LIMITS = { exhibitions: 200, images: 2000, name: 160, description: 10000, caption: 2000, artist: 160, year: 30, class: 80 };
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value, max, required = false) { return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0); }
function invalid() { throw new HttpError(400, 'Sergi/ayar bilgileri geçersiz veya izin verilen sınırı aşıyor.'); }
function validateDocument(path, data) {
  if (path === 'config.json') {
    if (!object(data) || Object.keys(data).some(k => k !== 'schoolName') || !text(data.schoolName, LIMITS.name, true)) invalid();
    return;
  }
  if (path !== 'exhibitions.json') throw new HttpError(400, 'Bu dosyaya erişim izinli değil.');
  if (!Array.isArray(data) || data.length > LIMITS.exhibitions) invalid();
  const ids = new Set();
  for (const ex of data) {
    if (!object(ex) || Object.keys(ex).some(k => !['id', 'name', 'description', 'year', 'class', 'driveFolderId', 'images'].includes(k))) invalid();
    if (!text(ex.id, 160, true) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ex.id) || ids.has(ex.id)) invalid();
    ids.add(ex.id);
    if (!text(ex.name, LIMITS.name, true) || typeof ex.driveFolderId !== 'string' || !DRIVE_ID.test(ex.driveFolderId)) invalid();
    for (const key of ['description', 'year', 'class']) if (ex[key] !== undefined && !text(ex[key], LIMITS[key])) invalid();
    if (!object(ex.images) || Object.keys(ex.images).length > LIMITS.images) invalid();
    for (const [id, image] of Object.entries(ex.images)) {
      if (!DRIVE_ID.test(id) || !object(image) || Object.keys(image).some(k => !['title', 'caption', 'artist'].includes(k))) invalid();
      for (const [key, value] of Object.entries(image)) if (!text(value, key === 'title' ? LIMITS.name : LIMITS[key])) invalid();
    }
  }
}
module.exports = { DRIVE_ID, SHA, LIMITS, validateDocument };
