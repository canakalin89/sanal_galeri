// Google Drive klasöründeki görselleri listele ve indir — Vercel Serverless Function
// GET /api/drive?action=list&folderId=...    → klasördeki görselleri listele
// GET /api/drive?action=download&fileId=...  → görseli indir (base64)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY ortam değişkeni tanımlı değil.' });
  }

  const { action, folderId, fileId } = req.query;

  try {
    if (action === 'list') {
      if (!folderId) return res.status(400).json({ error: 'folderId gerekli.' });

      const query = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,thumbnailLink)&pageSize=100&key=${apiKey}`;

      const r = await fetch(url);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({
          error: err.error?.message || 'Drive API hatası: ' + r.status
        });
      }

      const data = await r.json();
      return res.json({ files: data.files || [] });
    }

    if (action === 'download') {
      if (!fileId) return res.status(400).json({ error: 'fileId gerekli.' });

      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
      const r = await fetch(url);

      if (!r.ok) {
        return res.status(r.status).json({ error: 'Dosya indirilemedi: ' + r.status });
      }

      const buffer = await r.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = r.headers.get('content-type') || 'image/jpeg';

      return res.json({ base64, contentType, size: buffer.byteLength });
    }

    return res.status(400).json({ error: 'Geçersiz action. "list" veya "download" kullanın.' });

  } catch (err) {
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};
