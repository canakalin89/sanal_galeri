// Yönetim paneli kimlik doğrulama — Vercel Serverless Function
// POST /api/auth  { password: "..." }
// Doğru şifrede GitHub yapılandırmasını döner.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Yanlış şifre' });
  }

  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
    return res.status(500).json({ error: 'Sunucu yapılandırması eksik. Vercel ortam değişkenlerini kontrol edin.' });
  }

  res.json({
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
    repo:  process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || 'main'
  });
};
