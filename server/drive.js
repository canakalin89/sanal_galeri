const { HttpError } = require('./security');
const { DRIVE_ID, LIMITS } = require('./validation');
async function listImages(folderId) {
  if (typeof folderId !== 'string' || !DRIVE_ID.test(folderId)) throw new HttpError(400, 'Geçerli bir Drive klasör kimliği gerekli.');
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new HttpError(503, 'Görsel servisi yapılandırılmamış.');
  const files = [];
  let pageToken = '';
  const seen = new Set();
  const signal = AbortSignal.timeout(10000);
  do {
    const params = new URLSearchParams({ q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`, fields: 'nextPageToken,files(id,name,mimeType)', orderBy: 'createdTime,name', pageSize: '1000', key: apiKey });
    if (pageToken) params.set('pageToken', pageToken);
    let response, data;
    try {
      response = await fetch('https://www.googleapis.com/drive/v3/files?' + params, { signal, redirect: 'error' });
      if (!response.ok) throw new Error();
      data = await response.json();
    } catch { throw new HttpError(502, 'Drive klasörü okunamadı. Paylaşım iznini kontrol edip tekrar deneyin.'); }
    if (!Array.isArray(data.files)) throw new HttpError(502, 'Drive yanıtı doğrulanamadı.');
    for (const file of data.files) {
      if (!DRIVE_ID.test(file.id) || typeof file.name !== 'string' || !file.mimeType?.startsWith('image/')) throw new HttpError(502, 'Drive görsel bilgisi doğrulanamadı.');
      files.push({ id: file.id, name: file.name, thumbnailLink: 'https://lh3.googleusercontent.com/d/' + file.id + '=s400' });
    }
    if (files.length > LIMITS.images) throw new HttpError(422, `Bir sergi en fazla ${LIMITS.images} görsel içerebilir.`);
    pageToken = data.nextPageToken || '';
    if (pageToken && (typeof pageToken !== 'string' || seen.has(pageToken) || files.length >= LIMITS.images)) throw new HttpError(422, 'Drive listeleme sınırına ulaşıldı. Eksik listeyle devam edilmeyecek.');
    seen.add(pageToken);
  } while (pageToken);
  return files;
}
module.exports = { listImages };
