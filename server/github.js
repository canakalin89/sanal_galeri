const { HttpError } = require('./security');
const { SHA, validateDocument } = require('./validation');
function settings(path) {
  if (!['exhibitions.json', 'config.json'].includes(path)) throw new HttpError(400, 'Bu dosyaya erişim izinli değil.');
  const { GITHUB_TOKEN: token, GITHUB_OWNER: owner, GITHUB_REPO: repo, GITHUB_BRANCH: branch = 'main' } = process.env;
  if (!token || !owner || !repo) throw new HttpError(503, 'İçerik yönetimi yapılandırılmamış.');
  // Önizlemeden canlı dala yazmak kapalıdır.
  if (process.env.VERCEL_ENV === 'preview' && !branch.startsWith('preview/')) throw new HttpError(503, 'Önizleme için ayrı preview/ içerik dalı gerekli.');
  return { token, branch, url: `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}` };
}
async function request(path, init = {}) {
  const config = settings(path);
  const url = config.url + (init.method ? '' : '?ref=' + encodeURIComponent(config.branch));
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10000), redirect: 'error', headers: {
      Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'
    } });
  } catch { throw new HttpError(502, 'GitHub bağlantısı kurulamadı. Kayıt sonucu belirsizse sayfayı yenileyin.'); }
}
async function readDocument(path) {
  const response = await request(path);
  if (!response.ok) throw new HttpError(502, 'İçerik okunamadı. Boş veriyle kayıt yapılmayacak.');
  const file = await response.json();
  if (!SHA.test(file.sha) || file.encoding !== 'base64' || typeof file.content !== 'string') throw new HttpError(502, 'İçerik yanıtı doğrulanamadı.');
  let data;
  try { data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); validateDocument(path, data); }
  catch { throw new HttpError(502, 'Kayıtlı içerik geçersiz. Üzerine yazılmayacak.'); }
  return { data, sha: file.sha };
}
async function writeDocument(path, data, expectedSha) {
  const config = settings(path);
  validateDocument(path, data);
  if (typeof expectedSha !== 'string' || !SHA.test(expectedSha)) throw new HttpError(428, 'Önce içeriği yükleyin. Dosya sürümü gerekli.');
  // İstemcinin okuduğu SHA kullanılır; çakışma yeni SHA alınarak gizlenmez.
  const response = await request(path, { method: 'PUT', body: JSON.stringify({
    message: path === 'config.json' ? 'Yönetim: okul ayarları güncellendi' : 'Yönetim: sergiler güncellendi',
    branch: config.branch, sha: expectedSha, content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64')
  }) });
  if ([409, 422].includes(response.status)) throw new HttpError(409, 'İçerik başka bir oturumda değişmiş olabilir. Değişikliklerinizi kopyalayın, sayfayı yenileyip tekrar düzenleyin.');
  if (!response.ok) throw new HttpError(502, 'GitHub kaydı tamamlanamadı. Sayfayı yenileyerek sonucu kontrol edin.');
  const result = await response.json();
  if (!SHA.test(result.content?.sha)) throw new HttpError(502, 'Kayıt sonucu doğrulanamadı. Sayfayı yenileyin.');
  return { sha: result.content.sha, status: 'saved', publication: 'pending' };
}
module.exports = { readDocument, writeDocument };
