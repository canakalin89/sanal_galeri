// Sanal Galeri — Yönetim Paneli
// Sergi metadata'sı (exhibitions.json) GitHub'da tutulur.
// Görseller tamamen Google Drive'dan canlı çekilir — GitHub'a görsel yüklenmez.

/* ─── DURUM ──────────────────────────────────────────────── */

let csrfToken = null;
let currentExhibitionsList = [];   // exhibitions.json içeriği (tam dizi)
let currentExhibition = null;      // düzenlenen sergi (dizi içindeki referans)
let currentDriveFiles = [];
let editorSha = null;
let settingsSha = null;
let imagesReady = false;
let busy = false;
let editorDirty = false;
let settingsDirty = false;
let newDirty = false;
let editorGeneration = 0;

const driveListCache = {};

/* ─── AYNI KAYNAK API YARDIMCILARI ───────────────────────── */

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options, credentials: 'same-origin', cache: 'no-store',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers }
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'İşlem tamamlanamadı.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function readJson(path) {
  return apiRequest('/api/admin?path=' + encodeURIComponent(path));
}

async function saveJson(path, data, sha) {
  return apiRequest('/api/admin', { method: 'PUT', body: JSON.stringify({ path, data, sha }) });
}

function hasUnsavedChanges() { return editorDirty || settingsDirty || newDirty; }
function mayDiscard() { return !busy && (!hasUnsavedChanges() || confirm('Kaydedilmemiş değişiklikler var. Vazgeçilsin mi?')); }
function setBusy(value) {
  busy = value;
  document.querySelectorAll('button, input, textarea, select').forEach(el => {
    if (value) { el.dataset.wasDisabled = String(el.disabled); el.disabled = true; }
    else if ('wasDisabled' in el.dataset) { el.disabled = el.dataset.wasDisabled === 'true'; delete el.dataset.wasDisabled; }
  });
}
document.getElementById('page-editor').addEventListener('input', () => { editorDirty = true; });
document.getElementById('modal-settings').addEventListener('input', () => { settingsDirty = true; });
document.getElementById('modal-new').addEventListener('input', () => { newDirty = true; });
window.addEventListener('beforeunload', e => {
  if (hasUnsavedChanges() || busy) { e.preventDefault(); e.returnValue = ''; }
});

/* ─── DRIVE YARDIMCILARI ─────────────────────────────────── */

async function fetchDriveList(folderId, force) {
  if (!force && driveListCache[folderId]) return driveListCache[folderId];
  const data = await apiRequest('/api/admin-drive?folderId=' + encodeURIComponent(folderId));
  if (!Array.isArray(data.files)) throw new Error('Görsel listesi doğrulanamadı.');
  driveListCache[folderId] = data.files;
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
    const data = await apiRequest('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    csrfToken = data.csrf;
    document.getElementById('input-password').value = '';
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message || 'Bağlantı hatası. Tekrar deneyin.';
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
  document.getElementById('dashboard-error').classList.add('hidden');

  try {
    const { data: list } = await readJson('exhibitions.json');
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
    document.getElementById('dashboard-error-text').textContent = 'Sergiler yüklenemedi: ' + err.message;
    document.getElementById('dashboard-error').classList.remove('hidden');
  }
}

/* ─── EDİTÖR ─────────────────────────────────────────────── */

async function showEditor(id) {
  const generation = ++editorGeneration;
  currentExhibition = null;
  editorSha = null;
  editorDirty = false;
  imagesReady = false;
  document.getElementById('btn-save').disabled = true;
  document.getElementById('btn-delete-exhibition').disabled = true;
  document.getElementById('save-status').classList.add('hidden');
  showPage('page-editor');
  document.getElementById('editor-content').classList.add('hidden');
  document.getElementById('editor-loading').classList.remove('hidden');
  document.getElementById('editor-exhibition-name').textContent = '';

  try {
    const snapshot = await readJson('exhibitions.json');
    if (generation !== editorGeneration) return;
    currentExhibitionsList = snapshot.data;
    editorSha = snapshot.sha;
    const ex = currentExhibitionsList.find(e => e.id === id);
    if (!ex) throw new Error('Sergi bulunamadı.');
    currentExhibition = ex;
    document.getElementById('btn-delete-exhibition').disabled = false;

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
    if (generation !== editorGeneration) return;
    document.getElementById('editor-loading').classList.add('hidden');
    toast('Sergi yüklenemedi: ' + err.message, 'error');
    showDashboard();
  }
}

async function loadEditorImages(force) {
  const generation = editorGeneration;
  const exhibition = currentExhibition;
  if (!exhibition) return;
  imagesReady = false;
  document.getElementById('btn-save').disabled = true;
  document.getElementById('btn-drive-refresh').disabled = true;
  const loading = document.getElementById('images-loading');
  const grid = document.getElementById('images-grid');
  loading.classList.remove('hidden');
  grid.innerHTML = '';

  try {
    const files = await fetchDriveList(exhibition.driveFolderId, force);
    if (generation !== editorGeneration) return;
    currentDriveFiles = files;
    imagesReady = true;
    document.getElementById('btn-save').disabled = false;
    document.getElementById('image-count').textContent = currentDriveFiles.length + ' eser';
    loading.classList.add('hidden');

    if (currentDriveFiles.length === 0) {
      grid.innerHTML = '<p class="empty-images">Bu klasörde henüz görsel yok. Drive\'a görsel ekleyip "Yenile" butonuna tıklayın.</p>';
      return;
    }

    const metaImages = exhibition.images || {};
    currentDriveFiles.forEach(file => {
      const m = metaImages[file.id] || {};
      const thumbUrl = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+/, '=s300') : '';
      const item = document.createElement('div');
      item.className = 'image-item';
      item.dataset.fileId = file.id;
      item.innerHTML = `
        <img src="${thumbUrl}" alt="${escapeAttr(file.name)}" loading="lazy" />
        <div class="image-item-body">
          <input type="text" class="title-input" maxlength="${ADMIN_LIMITS.name}" placeholder="Eser başlığı (isteğe bağlı)" value="${escapeAttr(m.title || '')}" />
          <input type="text" class="caption-input" maxlength="${ADMIN_LIMITS.caption}" placeholder="Kısa açıklama (isteğe bağlı)" value="${escapeAttr(m.caption || '')}" />
          <input type="text" class="artist-input" maxlength="${ADMIN_LIMITS.artist}" placeholder="Öğrenci/Öğretmen adı (isteğe bağlı)" value="${escapeAttr(m.artist || '')}" />
        </div>
      `;
      grid.appendChild(item);
    });
  } catch (err) {
    if (generation !== editorGeneration) return;
    loading.classList.add('hidden');
    grid.innerHTML = `<p class="empty-images">Görseller yüklenemedi: ${escapeHtml(err.message)}</p>`;
  } finally {
    if (generation === editorGeneration) document.getElementById('btn-drive-refresh').disabled = false;
  }
}

document.getElementById('btn-drive-refresh').addEventListener('click', () => {
  if (editorDirty) { toast('Yenilemeden önce değişikliklerinizi kaydedin.', 'error'); return; }
  if (!busy) loadEditorImages(true);
});

/* ─── KAYDET ─────────────────────────────────────────────── */

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!currentExhibition || !imagesReady || busy || !editorSha) return;

  const btn = document.getElementById('btn-save');
  setBusy(true);
  btn.textContent = 'Kaydediliyor…';
  const status = document.getElementById('save-status');
  status.classList.remove('hidden');
  status.textContent = 'Kaydediliyor…';

  try {
    const rows = [];
    document.querySelectorAll('#images-grid .image-item').forEach(item => {
      const fileId = item.dataset.fileId;
      const title = item.querySelector('.title-input').value.trim();
      const caption = item.querySelector('.caption-input').value.trim();
      const artist = item.querySelector('.artist-input').value.trim();
      rows.push({ id: fileId, title, caption, artist });
    });

    const name = document.getElementById('field-name').value.trim();
    const description = document.getElementById('field-description').value.trim();
    const year = document.getElementById('field-year').value.trim();
    const klass = document.getElementById('field-class').value.trim();

    if (!name) throw new Error('Sergi adı boş olamaz.');
    const updated = GalleryAdminState.updateExhibition(currentExhibition, { name, description, year, class: klass }, rows);
    const list = currentExhibitionsList.map(ex => ex.id === updated.id ? updated : ex);
    const result = await saveJson('exhibitions.json', list, editorSha);
    currentExhibition = updated;
    currentExhibitionsList = list;
    editorSha = result.sha;
    editorDirty = false;

    document.getElementById('editor-exhibition-name').textContent = currentExhibition.name;
    status.textContent = 'GitHub’a kaydedildi. Canlı görünüm, yayın tamamlandığında güncellenir.';
  } catch (err) {
    status.textContent = 'Kayıt hatası: ' + err.message;
    toast('Kayıt hatası: ' + err.message, 'error');
  } finally {
    setBusy(false);
    btn.textContent = 'Kaydet';
  }
});

/* ─── SERGİ SİL ──────────────────────────────────────────── */

document.getElementById('btn-delete-exhibition').addEventListener('click', async () => {
  if (!currentExhibition || busy || !editorSha) return;
  const name = currentExhibition.name || currentExhibition.id;
  if (!confirm(`"${name}" sergisi siteden kaldırılsın mı?\n\nNot: Bu işlem yalnızca site bağlantısını kaldırır. Drive'daki görselleriniz silinmez.`)) return;

  const btn = document.getElementById('btn-delete-exhibition');
  setBusy(true);
  btn.textContent = 'Kaldırılıyor…';

  try {
    const updated = currentExhibitionsList.filter(e => e.id !== currentExhibition.id);
    await saveJson('exhibitions.json', updated, editorSha);
    toast('Kaldırma GitHub’a kaydedildi. Canlı site yayın tamamlandığında güncellenir.');
    editorDirty = false;
    editorGeneration++;
    currentExhibition = null;
    showDashboard();
  } catch (err) {
    toast('Silme hatası: ' + err.message, 'error');
  } finally {
    setBusy(false);
    btn.textContent = 'Sergiyi Sil';
  }
});

/* ─── YENİ SERGİ ─────────────────────────────────────────── */

document.getElementById('btn-first-exhibition').addEventListener('click', () => document.getElementById('btn-new-exhibition').click());

document.getElementById('btn-new-exhibition').addEventListener('click', () => {
  if (busy) return;
  newDirty = false;
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
  if (!mayDiscard()) return;
  newDirty = false;
  document.getElementById('modal-new').classList.add('hidden');
});

document.getElementById('modal-new').addEventListener('click', e => {
  if (e.target === e.currentTarget && mayDiscard()) { newDirty = false; e.currentTarget.classList.add('hidden'); }
});

document.getElementById('btn-modal-create').addEventListener('click', async () => {
  if (busy) return;
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
  setBusy(true);
  btn.textContent = 'Oluşturuluyor…';

  try {
    // Drive erişimini doğrula
    await fetchDriveList(folderId, true);

    const { data: list, sha } = await readJson('exhibitions.json');
    const existingIds = new Set(list.map(e => e.id));
    const baseId = slugify(name).replace(/^-+|-+$/g, '').replace(/-+/g, '-') || 'sergi';
    let id = baseId;
    let suffix = 2;
    while (existingIds.has(id)) { id = baseId + '-' + suffix; suffix++; }

    const newEx = { id, name, driveFolderId: folderId, images: {} };
    if (description) newEx.description = description;
    if (year) newEx.year = year;
    if (klass) newEx.class = klass;

    list.unshift(newEx);
    await saveJson('exhibitions.json', list, sha);
    newDirty = false;

    document.getElementById('modal-new').classList.add('hidden');
    toast(`"${name}" GitHub’a kaydedildi. Canlı site yayın tamamlandığında güncellenir.`);
    setBusy(false);
    await showEditor(id);
  } catch (err) {
    errEl.textContent = 'Oluşturma hatası: ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    if (busy) setBusy(false);
    btn.textContent = 'Oluştur';
  }
});

/* ─── NAVİGASYON ─────────────────────────────────────────── */

document.getElementById('btn-back').addEventListener('click', () => {
  if (!mayDiscard()) return;
  editorDirty = false;
  editorGeneration++;
  currentExhibition = null;
  showDashboard();
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  if (!mayDiscard()) return;
  try { await apiRequest('/api/auth', { method: 'DELETE' }); }
  catch (err) { if (err.status !== 401) { toast('Çıkış yapılamadı: ' + err.message, 'error'); return; } }
  csrfToken = null;
  editorDirty = settingsDirty = newDirty = false;
  editorGeneration++;
  currentExhibition = null;
  try { sessionStorage.removeItem('gh_session'); } catch {}
  document.getElementById('input-password').value = '';
  showPage('page-login');
});

/* ─── AYARLAR ────────────────────────────────────────────── */

document.getElementById('btn-settings').addEventListener('click', async () => {
  if (busy) return;
  document.getElementById('settings-error').classList.add('hidden');
  let config;
  settingsSha = null;
  try {
    const snapshot = await readJson('config.json');
    config = snapshot.data;
    settingsSha = snapshot.sha;
  } catch (err) { toast(err.message, 'error'); return; }
  settingsDirty = false;
  document.getElementById('settings-school-name').value = config.schoolName || '';
  document.getElementById('modal-settings').classList.remove('hidden');
  document.getElementById('settings-school-name').focus();
});

document.getElementById('btn-settings-cancel').addEventListener('click', () => {
  if (!mayDiscard()) return;
  settingsDirty = false;
  document.getElementById('modal-settings').classList.add('hidden');
});

document.getElementById('modal-settings').addEventListener('click', e => {
  if (e.target === e.currentTarget && mayDiscard()) { settingsDirty = false; e.currentTarget.classList.add('hidden'); }
});

document.getElementById('btn-settings-save').addEventListener('click', async () => {
  if (busy || !settingsSha) return;
  const schoolName = document.getElementById('settings-school-name').value.trim();
  const errEl = document.getElementById('settings-error');
  errEl.classList.add('hidden');

  if (!schoolName) {
    errEl.textContent = 'Okul adı boş olamaz.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('btn-settings-save');
  setBusy(true);
  btn.textContent = 'Kaydediliyor…';

  try {
    const result = await saveJson('config.json', { schoolName }, settingsSha);
    settingsSha = result.sha;
    settingsDirty = false;
    document.getElementById('modal-settings').classList.add('hidden');
    toast('Ayarlar GitHub’a kaydedildi. Canlı site yayın tamamlandığında güncellenir.');
  } catch (err) {
    errEl.textContent = 'Kayıt hatası: ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    setBusy(false);
    btn.textContent = 'Kaydet';
  }
});

/* ─── GÖMME KODU ────────────────────────────────────────── */

document.getElementById('btn-embed').addEventListener('click', async () => {
  const select = document.getElementById('embed-target');
  while (select.options.length > 1) select.remove(1);

  try {
    const { data: list } = await readJson('exhibitions.json');
    list.forEach(ex => {
      const opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = ex.name;
      select.appendChild(opt);
    });
  } catch (err) { toast(err.message, 'error'); return; }

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

  const code = `<iframe src="${src}" width="${width}" height="${height}" frameborder="0" style="border:none;border-radius:4px;" allow="fullscreen; pointer-lock" allowfullscreen></iframe>`;
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

// Eski sürümden kalan token'ı okumadan temizle.
try { sessionStorage.removeItem('gh_session'); } catch {}
document.getElementById('btn-dashboard-retry').addEventListener('click', () => { if (!busy) showDashboard(); });
document.getElementById('btn-login').disabled = true;
apiRequest('/api/auth').then(session => {
  csrfToken = session.csrf;
  showDashboard();
}).catch(() => showPage('page-login')).finally(() => { document.getElementById('btn-login').disabled = false; });

const fieldLimits = {
  'field-name': 'name', 'field-description': 'description', 'field-year': 'year', 'field-class': 'class',
  'new-exhibition-name': 'name', 'new-exhibition-description': 'description', 'new-exhibition-year': 'year',
  'new-exhibition-class': 'class', 'settings-school-name': 'name'
};
for (const [id, limit] of Object.entries(fieldLimits)) document.getElementById(id).maxLength = ADMIN_LIMITS[limit];
