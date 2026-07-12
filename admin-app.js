// Sanal Galeri — Yönetim Paneli
// Sergi metadata'sı (exhibitions.json) GitHub'da tutulur.
// Görseller tamamen Google Drive'dan canlı çekilir — GitHub'a görsel yüklenmez.

/* ─── DURUM ──────────────────────────────────────────────── */

let GH = null;                     // { token, owner, repo, branch }
let currentExhibitionsList = [];   // exhibitions.json içeriği (tam dizi)
let currentExhibition = null;      // düzenlenen sergi (dizi içindeki referans)
let currentDriveFiles = [];

const driveListCache = {};

/* ─── GITHUB API YARDIMCILARI ────────────────────────────── */

function ghHeaders() {
  return {
    'Authorization': `token ${GH.token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
}

async function readJson(path, fallback) {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${encodeURIComponent(GH.branch)}`,
      { headers: ghHeaders() }
    );
    if (r.status === 404) return fallback;
    if (!r.ok) throw new Error('Okuma hatası: ' + r.status);
    const data = await r.json();
    const text = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    return JSON.parse(text);
  } catch (err) {
    console.error('readJson(' + path + ')', err);
    return fallback;
  }
}

async function ghPut(path, textContent, message) {
  let sha = null;
  try {
    const existing = await fetch(
      `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${encodeURIComponent(GH.branch)}`,
      { headers: ghHeaders() }
    );
    if (existing.ok) sha = (await existing.json()).sha;
  } catch {}

  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(textContent))),
    branch: GH.branch
  };
  if (sha) body.sha = sha;

  const r = await fetch(
    `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}`,
    { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) }
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `Kayıt hatası: ${r.status}`);
  }
  return r.json();
}

/* ─── DRIVE YARDIMCILARI ─────────────────────────────────── */

async function fetchDriveList(folderId, force) {
  if (!force && driveListCache[folderId]) return driveListCache[folderId];
  const r = await fetch('/api/drive?action=list&folderId=' + encodeURIComponent(folderId));
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Drive API hatası');
  driveListCache[folderId] = data.files || [];
  return driveListCache[folderId];
}

function extractFolderId(input) {
  input = (input || '').trim();
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input)) return input;
  return null;
}

/* ─── SAYFA YÖNETİMİ ─────────────────────────────────────── */

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

/* ─── BİLDİRİM (TOAST) ──────────────────────────────────── */

let toastTimer = null;
function toast(message, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast toast-${type}`;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

/* ─── YARDIMCI: HTML KAÇIŞ ───────────────────────────────── */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugify(name) {
  return name.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/* ─── GİRİŞ ─────────────────────────────────────────────── */

document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');
  const password = document.getElementById('input-password').value;

  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor…';
  errEl.classList.add('hidden');

  try {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await r.json();

    if (!r.ok) {
      errEl.textContent = data.error || 'Giriş başarısız';
      errEl.classList.remove('hidden');
      return;
    }

    GH = data;
    sessionStorage.setItem('gh_session', JSON.stringify(GH));
    showDashboard();
  } catch {
    errEl.textContent = 'Bağlantı hatası. Tekrar deneyin.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
  }
});

/* ─── DASHBOARD ──────────────────────────────────────────── */

async function showDashboard() {
  showPage('page-dashboard');
  const grid = document.getElementById('exhibitions-grid');
  const loading = document.getElementById('dashboard-loading');
  const empty = document.getElementById('dashboard-empty');

  grid.classList.add('hidden');
  empty.classList.add('hidden');
  loading.classList.remove('hidden');

  try {
    const list = await readJson('exhibitions.json', []);
    loading.classList.add('hidden');

    if (list.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    grid.innerHTML = '';
    grid.classList.remove('hidden');

    list.forEach(ex => {
      const card = document.createElement('div');
      card.className = 'dash-card';
      card.innerHTML = `
        <div class="dash-card-thumb skeleton"></div>
        <div class="dash-card-body">
          <strong>${escapeHtml(ex.name)}</strong>
          ${ex.year ? `<span class="meta-tag">${escapeHtml(ex.year)}</span>` : ''}
          ${ex.class ? `<span class="meta-tag">${escapeHtml(ex.class)}</span>` : ''}
          <span class="meta-tag meta-tag-drive">&#9729; Drive</span>
        </div>
        <div class="dash-card-actions">
          <button class="btn-primary btn-sm" data-id="${escapeAttr(ex.id)}">Düzenle</button>
        </div>
      `;
      card.querySelector('[data-id]').addEventListener('click', () => showEditor(ex.id));
      grid.appendChild(card);

      const thumbEl = card.querySelector('.dash-card-thumb');
      fetchDriveList(ex.driveFolderId).then(files => {
        thumbEl.classList.remove('skeleton');
        if (files.length > 0 && files[0].thumbnailLink) {
          thumbEl.style.backgroundImage = `url('${files[0].thumbnailLink.replace(/=s\d+/, '=s400')}')`;
        } else {
          thumbEl.innerHTML = '<span class="no-thumb">Resim yok</span>';
        }
      }).catch(() => {
        thumbEl.classList.remove('skeleton');
        thumbEl.innerHTML = '<span class="no-thumb">Drive erişilemedi</span>';
      });
    });
  } catch (err) {
    loading.classList.add('hidden');
    toast('Sergiler yüklenemedi: ' + err.message, 'error');
  }
}

/* ─── EDİTÖR ─────────────────────────────────────────────── */

async function showEditor(id) {
  showPage('page-editor');
  document.getElementById('editor-content').classList.add('hidden');
  document.getElementById('editor-loading').classList.remove('hidden');
  document.getElementById('editor-exhibition-name').textContent = '';

  try {
    currentExhibitionsList = await readJson('exhibitions.json', []);
    const ex = currentExhibitionsList.find(e => e.id === id);
    if (!ex) throw new Error('Sergi bulunamadı.');
    currentExhibition = ex;

    document.getElementById('editor-exhibition-name').textContent = ex.name;
    document.getElementById('field-name').value = ex.name || '';
    document.getElementById('field-description').value = ex.description || '';
    document.getElementById('field-year').value = ex.year || '';
    document.getElementById('field-class').value = ex.class || '';

    const link = document.getElementById('drive-folder-link');
    link.href = 'https://drive.google.com/drive/folders/' + ex.driveFolderId;
    link.textContent = "Drive'da Aç ↗";

    document.getElementById('editor-loading').classList.add('hidden');
    document.getElementById('editor-content').classList.remove('hidden');

    await loadEditorImages(false);
  } catch (err) {
    document.getElementById('editor-loading').classList.add('hidden');
    toast('Sergi yüklenemedi: ' + err.message, 'error');
    showDashboard();
  }
}

async function loadEditorImages(force) {
  const loading = document.getElementById('images-loading');
  const grid = document.getElementById('images-grid');
  loading.classList.remove('hidden');
  grid.innerHTML = '';

  try {
    currentDriveFiles = await fetchDriveList(currentExhibition.driveFolderId, force);
    document.getElementById('image-count').textContent = currentDriveFiles.length + ' eser';
    loading.classList.add('hidden');

    if (currentDriveFiles.length === 0) {
      grid.innerHTML = '<p class="empty-images">Bu klasörde henüz görsel yok. Drive\'a görsel ekleyip "Yenile" butonuna tıklayın.</p>';
      return;
    }

    const metaImages = currentExhibition.images || {};
    currentDriveFiles.forEach(file => {
      const m = metaImages[file.id] || {};
      const thumbUrl = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+/, '=s300') : '';
      const item = document.createElement('div');
      item.className = 'image-item';
      item.dataset.fileId = file.id;
      item.innerHTML = `
        <img src="${thumbUrl}" alt="${escapeAttr(file.name)}" loading="lazy" />
        <div class="image-item-body">
          <input type="text" class="title-input" placeholder="Eser başlığı (isteğe bağlı)" value="${escapeAttr(m.title || '')}" />
          <input type="text" class="caption-input" placeholder="Kısa açıklama (isteğe bağlı)" value="${escapeAttr(m.caption || '')}" />
          <input type="text" class="artist-input" placeholder="Öğrenci/Öğretmen adı (isteğe bağlı)" value="${escapeAttr(m.artist || '')}" />
        </div>
      `;
      grid.appendChild(item);
    });
  } catch (err) {
    loading.classList.add('hidden');
    grid.innerHTML = `<p class="empty-images">Görseller yüklenemedi: ${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('btn-drive-refresh').addEventListener('click', () => loadEditorImages(true));

/* ─── KAYDET ─────────────────────────────────────────────── */

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!currentExhibition) return;

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor…';

  try {
    const images = {};
    document.querySelectorAll('#images-grid .image-item').forEach(item => {
      const fileId = item.dataset.fileId;
      const title = item.querySelector('.title-input').value.trim();
      const caption = item.querySelector('.caption-input').value.trim();
      const artist = item.querySelector('.artist-input').value.trim();
      if (title || caption || artist) {
        images[fileId] = {};
        if (title) images[fileId].title = title;
        if (caption) images[fileId].caption = caption;
        if (artist) images[fileId].artist = artist;
      }
    });

    const name = document.getElementById('field-name').value.trim();
    const description = document.getElementById('field-description').value.trim();
    const year = document.getElementById('field-year').value.trim();
    const klass = document.getElementById('field-class').value.trim();

    currentExhibition.name = name || currentExhibition.name;
    if (description) currentExhibition.description = description; else delete currentExhibition.description;
    if (year) currentExhibition.year = year; else delete currentExhibition.year;
    if (klass) currentExhibition.class = klass; else delete currentExhibition.class;
    currentExhibition.images = images;

    await ghPut(
      'exhibitions.json',
      JSON.stringify(currentExhibitionsList, null, 2),
      `Yönetim: ${currentExhibition.id} güncellendi`
    );

    document.getElementById('editor-exhibition-name').textContent = currentExhibition.name;
    toast('Kaydedildi. Galeri birkaç saniye içinde güncellenir.');
  } catch (err) {
    toast('Kayıt hatası: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kaydet';
  }
});

/* ─── SERGİ SİL ──────────────────────────────────────────── */

document.getElementById('btn-delete-exhibition').addEventListener('click', async () => {
  if (!currentExhibition) return;
  const name = currentExhibition.name || currentExhibition.id;
  if (!confirm(`"${name}" sergisi siteden kaldırılsın mı?\n\nNot: Bu işlem yalnızca site bağlantısını kaldırır. Drive'daki görselleriniz silinmez.`)) return;

  const btn = document.getElementById('btn-delete-exhibition');
  btn.disabled = true;
  btn.textContent = 'Kaldırılıyor…';

  try {
    const updated = currentExhibitionsList.filter(e => e.id !== currentExhibition.id);
    await ghPut('exhibitions.json', JSON.stringify(updated, null, 2), `Yönetim: ${currentExhibition.id} kaldırıldı`);
    toast('Sergi kaldırıldı.');
    currentExhibition = null;
    showDashboard();
  } catch (err) {
    toast('Silme hatası: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Sergiyi Sil';
  }
});

/* ─── YENİ SERGİ ─────────────────────────────────────────── */

document.getElementById('btn-new-exhibition').addEventListener('click', () => {
  document.getElementById('new-exhibition-name').value = '';
  document.getElementById('new-exhibition-drive').value = '';
  document.getElementById('new-exhibition-description').value = '';
  document.getElementById('new-exhibition-year').value = '';
  document.getElementById('new-exhibition-class').value = '';
  document.getElementById('modal-error').classList.add('hidden');
  document.getElementById('modal-new').classList.remove('hidden');
  document.getElementById('new-exhibition-name').focus();
});

document.getElementById('btn-modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-new').classList.add('hidden');
});

document.getElementById('modal-new').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

document.getElementById('btn-modal-create').addEventListener('click', async () => {
  const name = document.getElementById('new-exhibition-name').value.trim();
  const driveInput = document.getElementById('new-exhibition-drive').value;
  const description = document.getElementById('new-exhibition-description').value.trim();
  const year = document.getElementById('new-exhibition-year').value.trim();
  const klass = document.getElementById('new-exhibition-class').value.trim();
  const errEl = document.getElementById('modal-error');
  errEl.classList.add('hidden');

  if (!name) {
    errEl.textContent = 'Sergi adı boş olamaz.';
    errEl.classList.remove('hidden');
    return;
  }

  const folderId = extractFolderId(driveInput);
  if (!folderId) {
    errEl.textContent = 'Geçerli bir Drive klasör linki veya ID girin.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('btn-modal-create');
  btn.disabled = true;
  btn.textContent = 'Oluşturuluyor…';

  try {
    // Drive erişimini doğrula
    await fetchDriveList(folderId, true);

    const list = await readJson('exhibitions.json', []);
    const existingIds = new Set(list.map(e => e.id));
    let id = slugify(name) || 'sergi';
    let suffix = 2;
    while (existingIds.has(id)) { id = slugify(name) + '-' + suffix; suffix++; }

    const newEx = { id, name, driveFolderId: folderId, images: {} };
    if (description) newEx.description = description;
    if (year) newEx.year = year;
    if (klass) newEx.class = klass;

    list.unshift(newEx);
    await ghPut('exhibitions.json', JSON.stringify(list, null, 2), `Yönetim: ${name} sergisi oluşturuldu`);

    document.getElementById('modal-new').classList.add('hidden');
    toast(`"${name}" sergisi oluşturuldu.`);
    showEditor(id);
  } catch (err) {
    errEl.textContent = 'Oluşturma hatası: ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Oluştur';
  }
});

/* ─── NAVİGASYON ─────────────────────────────────────────── */

document.getElementById('btn-back').addEventListener('click', () => {
  currentExhibition = null;
  showDashboard();
});

document.getElementById('btn-logout').addEventListener('click', () => {
  GH = null;
  currentExhibition = null;
  sessionStorage.removeItem('gh_session');
  document.getElementById('input-password').value = '';
  showPage('page-login');
});

/* ─── AYARLAR ────────────────────────────────────────────── */

document.getElementById('btn-settings').addEventListener('click', async () => {
  document.getElementById('settings-error').classList.add('hidden');
  const config = await readJson('config.json', {});
  document.getElementById('settings-school-name').value = config.schoolName || '';
  document.getElementById('modal-settings').classList.remove('hidden');
  document.getElementById('settings-school-name').focus();
});

document.getElementById('btn-settings-cancel').addEventListener('click', () => {
  document.getElementById('modal-settings').classList.add('hidden');
});

document.getElementById('modal-settings').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

document.getElementById('btn-settings-save').addEventListener('click', async () => {
  const schoolName = document.getElementById('settings-school-name').value.trim();
  const errEl = document.getElementById('settings-error');
  errEl.classList.add('hidden');

  if (!schoolName) {
    errEl.textContent = 'Okul adı boş olamaz.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('btn-settings-save');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor…';

  try {
    await ghPut('config.json', JSON.stringify({ schoolName }, null, 2), 'Yönetim: okul adı güncellendi');
    document.getElementById('modal-settings').classList.add('hidden');
    toast('Ayarlar kaydedildi. Galeri birkaç saniye içinde güncellenir.');
  } catch (err) {
    errEl.textContent = 'Kayıt hatası: ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kaydet';
  }
});

/* ─── GÖMME KODU ────────────────────────────────────────── */

document.getElementById('btn-embed').addEventListener('click', async () => {
  const select = document.getElementById('embed-target');
  while (select.options.length > 1) select.remove(1);

  try {
    const list = await readJson('exhibitions.json', []);
    list.forEach(ex => {
      const opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = ex.name;
      select.appendChild(opt);
    });
  } catch (e) {}

  updateEmbedCode();
  document.getElementById('modal-embed').classList.remove('hidden');
});

document.getElementById('embed-target').addEventListener('change', updateEmbedCode);
document.getElementById('embed-width').addEventListener('input', updateEmbedCode);
document.getElementById('embed-height').addEventListener('input', updateEmbedCode);

function updateEmbedCode() {
  const target = document.getElementById('embed-target').value;
  const width = document.getElementById('embed-width').value || '100%';
  const height = document.getElementById('embed-height').value || '600px';

  const baseUrl = window.location.origin;
  let src = baseUrl + '/?embed=1';
  if (target) src += '#' + target;

  const code = `<iframe src="${src}" width="${width}" height="${height}" frameborder="0" style="border:none;border-radius:4px;" allowfullscreen></iframe>`;
  document.getElementById('embed-code').value = code;
}

document.getElementById('btn-embed-copy').addEventListener('click', () => {
  const textarea = document.getElementById('embed-code');
  textarea.select();
  navigator.clipboard.writeText(textarea.value).then(() => {
    toast('Gömme kodu kopyalandı.');
  }).catch(() => {
    document.execCommand('copy');
    toast('Gömme kodu kopyalandı.');
  });
});

document.getElementById('btn-embed-close').addEventListener('click', () => {
  document.getElementById('modal-embed').classList.add('hidden');
});

document.getElementById('modal-embed').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

/* ─── BAŞLAT ─────────────────────────────────────────────── */

const savedSession = sessionStorage.getItem('gh_session');
if (savedSession) {
  try {
    GH = JSON.parse(savedSession);
    showDashboard();
  } catch {
    showPage('page-login');
  }
} else {
  showPage('page-login');
}
