// Sanal Galeri — Yönetim Paneli
// GitHub API doğrudan tarayıcıdan kullanılır (token /api/auth üzerinden alınır).

/* ─── DURUM ──────────────────────────────────────────────── */

let GH = null;           // { token, owner, repo, branch }
let currentExhibition = null;  // { id, images: [{name, sha}], meta: {} }

/* ─── GITHUB API YARDIMCILARI ────────────────────────────── */

function ghHeaders() {
  return {
    'Authorization': `token ${GH.token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
}

async function ghGet(path) {
  const r = await fetch(
    `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}`,
    { headers: ghHeaders() }
  );
  if (!r.ok) throw new Error(`GitHub API hatası: ${r.status}`);
  return r.json();
}

async function ghPut(path, textContent, message) {
  // Mevcut dosyanın SHA'sını al (güncelleme için gerekli)
  let sha = null;
  try {
    const existing = await fetch(
      `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}`,
      { headers: ghHeaders() }
    );
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
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

async function ghPutBinary(path, arrayBuffer, message) {
  let sha = null;
  try {
    const existing = await fetch(
      `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}`,
      { headers: ghHeaders() }
    );
    if (existing.ok) sha = (await existing.json()).sha;
  } catch {}

  // ArrayBuffer → base64
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const body = { message, content: base64, branch: GH.branch };
  if (sha) body.sha = sha;

  const r = await fetch(
    `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}`,
    { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) }
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `Yükleme hatası: ${r.status}`);
  }
  return r.json();
}

async function ghDelete(path, sha, message) {
  const r = await fetch(
    `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}`,
    {
      method: 'DELETE',
      headers: ghHeaders(),
      body: JSON.stringify({ message, sha, branch: GH.branch })
    }
  );
  if (!r.ok && r.status !== 404) {
    throw new Error(`Silme hatası: ${r.status}`);
  }
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
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
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
    const entries = await ghGet('images');
    const dirs = Array.isArray(entries) ? entries.filter(e => e.type === 'dir') : [];

    // Her klasörün meta.json'ını paralel oku
    const exhibitions = await Promise.all(dirs.map(async dir => {
      let meta = {};
      try {
        const metaFile = await fetch(
          `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/images/${dir.name}/meta.json`,
          { headers: ghHeaders() }
        );
        if (metaFile.ok) {
          const data = await metaFile.json();
          meta = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))));
        }
      } catch {}

      // Kapak görseli: klasördeki ilk resim
      let thumb = null;
      try {
        const files = await ghGet(`images/${dir.name}`);
        const imgFile = files.find(f => /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f.name));
        if (imgFile) {
          thumb = `https://raw.githubusercontent.com/${GH.owner}/${GH.repo}/${GH.branch}/images/${dir.name}/${encodeURIComponent(imgFile.name)}`;
        }
      } catch {}

      return { id: dir.name, meta, thumb };
    }));

    loading.classList.add('hidden');

    if (exhibitions.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    grid.innerHTML = '';
    exhibitions.forEach(ex => {
      const displayName = ex.meta.name || formatFolderName(ex.id);
      const card = document.createElement('div');
      card.className = 'dash-card';
      card.innerHTML = `
        <div class="dash-card-thumb" style="${ex.thumb ? `background-image:url('${ex.thumb}')` : ''}">
          ${!ex.thumb ? '<span class="no-thumb">Resim yok</span>' : ''}
        </div>
        <div class="dash-card-body">
          <strong>${displayName}</strong>
          ${ex.meta.year ? `<span class="meta-tag">${ex.meta.year}</span>` : ''}
          ${ex.meta.class ? `<span class="meta-tag">${ex.meta.class}</span>` : ''}
        </div>
        <div class="dash-card-actions">
          <button class="btn-primary btn-sm" data-id="${ex.id}">Düzenle</button>
        </div>
      `;
      card.querySelector('[data-id]').addEventListener('click', () => showEditor(ex.id));
      grid.appendChild(card);
    });

    grid.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    toast('Sergiler yüklenemedi: ' + err.message, 'error');
  }
}

/* ─── EDİTÖR ─────────────────────────────────────────────── */

async function showEditor(exhibitionId) {
  showPage('page-editor');
  const editorLoading = document.getElementById('editor-loading');
  const imagesGrid = document.getElementById('images-grid');

  editorLoading.classList.remove('hidden');
  imagesGrid.innerHTML = '';
  document.getElementById('editor-exhibition-name').textContent = '';

  try {
    // Meta ve resimleri paralel yükle
    const [metaResult, imagesResult] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/images/${exhibitionId}/meta.json`,
        { headers: ghHeaders() }
      ).then(async r => {
        if (r.status === 404) return {};
        if (!r.ok) throw new Error('Meta okunamadı');
        const data = await r.json();
        return JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))));
      }),
      ghGet(`images/${exhibitionId}`)
        .then(files => files.filter(f => /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f.name)))
        .catch(() => [])
    ]);

    const meta = metaResult;
    const images = imagesResult;
    const artists = meta.artists || {};

    currentExhibition = { id: exhibitionId, images, meta };

    const displayName = meta.name || formatFolderName(exhibitionId);
    document.getElementById('editor-exhibition-name').textContent = displayName;
    document.getElementById('field-name').value = meta.name || displayName;
    document.getElementById('field-description').value = meta.description || '';
    document.getElementById('field-year').value = meta.year || '';
    document.getElementById('field-class').value = meta.class || '';
    document.getElementById('image-count').textContent = images.length > 0 ? `${images.length} eser` : '';

    editorLoading.classList.add('hidden');

    if (images.length === 0) {
      imagesGrid.innerHTML = '<p class="empty-images">Henüz resim yok. Yukarıdan resim yükleyebilirsiniz.</p>';
    } else {
      images.forEach(img => {
        const thumbUrl = `https://raw.githubusercontent.com/${GH.owner}/${GH.repo}/${GH.branch}/images/${exhibitionId}/${encodeURIComponent(img.name)}`;
        const item = document.createElement('div');
        item.className = 'image-item';
        item.dataset.filename = img.name;
        item.dataset.sha = img.sha;
        item.innerHTML = `
          <img src="${thumbUrl}" alt="${img.name}" loading="lazy" />
          <div class="image-item-body">
            <input
              type="text"
              class="artist-input"
              placeholder="Öğrenci adı (isteğe bağlı)"
              value="${artists[img.name] || ''}"
              data-filename="${img.name}"
            />
            <button class="btn-icon-delete" data-filename="${img.name}" data-sha="${img.sha}" title="Resmi sil">✕</button>
          </div>
        `;
        item.querySelector('.btn-icon-delete').addEventListener('click', e => {
          deleteImage(exhibitionId, e.currentTarget.dataset.filename, e.currentTarget.dataset.sha, item);
        });
        imagesGrid.appendChild(item);
      });
    }
  } catch (err) {
    editorLoading.classList.add('hidden');
    toast('Sergi yüklenemedi: ' + err.message, 'error');
    showDashboard();
  }
}

/* ─── KAYDET ─────────────────────────────────────────────── */

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!currentExhibition) return;

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor…';

  try {
    // Sanatçı adlarını topla
    const artists = {};
    document.querySelectorAll('.artist-input').forEach(input => {
      const val = input.value.trim();
      if (val) artists[input.dataset.filename] = val;
    });

    const meta = {
      name: document.getElementById('field-name').value.trim() || undefined,
      description: document.getElementById('field-description').value.trim() || undefined,
      year: document.getElementById('field-year').value.trim() || undefined,
      class: document.getElementById('field-class').value.trim() || undefined,
      artists: Object.keys(artists).length > 0 ? artists : undefined
    };

    // undefined alanları temizle
    Object.keys(meta).forEach(k => meta[k] === undefined && delete meta[k]);

    const metaJson = JSON.stringify(meta, null, 2);
    await ghPut(
      `images/${currentExhibition.id}/meta.json`,
      metaJson,
      `Yönetim: ${currentExhibition.id} güncellendi`
    );

    const displayName = meta.name || formatFolderName(currentExhibition.id);
    document.getElementById('editor-exhibition-name').textContent = displayName;

    toast('Kaydedildi. Galeri 1-2 dakika içinde güncellenir.');
  } catch (err) {
    toast('Kayıt hatası: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kaydet';
  }
});

/* ─── RESİM YÜKLEME ──────────────────────────────────────── */

document.getElementById('file-upload').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  if (!files.length || !currentExhibition) return;

  const btn = document.getElementById('btn-save');
  btn.disabled = true;

  let success = 0;
  let failed = 0;

  for (const file of files) {
    if (file.size > 3 * 1024 * 1024) {
      toast(`"${file.name}" 3 MB'tan büyük, atlandı.`, 'error');
      failed++;
      continue;
    }

    try {
      const buffer = await file.arrayBuffer();
      await ghPutBinary(
        `images/${currentExhibition.id}/${file.name}`,
        buffer,
        `Yönetim: ${currentExhibition.id} resim eklendi`
      );
      success++;
    } catch (err) {
      toast(`"${file.name}" yüklenemedi: ${err.message}`, 'error');
      failed++;
    }
  }

  e.target.value = '';
  btn.disabled = false;

  if (success > 0) {
    toast(`${success} resim yüklendi. Sayfa yenileniyor…`);
    setTimeout(() => showEditor(currentExhibition.id), 1500);
  }
});

/* ─── RESİM SİL ──────────────────────────────────────────── */

async function deleteImage(exhibitionId, filename, sha, itemEl) {
  if (!confirm(`"${filename}" silinsin mi?`)) return;

  try {
    await ghDelete(
      `images/${exhibitionId}/${filename}`,
      sha,
      `Yönetim: ${exhibitionId}/${filename} silindi`
    );
    itemEl.remove();

    // Sayaç güncelle
    const remaining = document.querySelectorAll('.image-item').length;
    document.getElementById('image-count').textContent = remaining > 0 ? `${remaining} eser` : '';
    if (remaining === 0) {
      document.getElementById('images-grid').innerHTML = '<p class="empty-images">Henüz resim yok. Yukarıdan resim yükleyebilirsiniz.</p>';
    }

    toast('Resim silindi.');
  } catch (err) {
    toast('Silme hatası: ' + err.message, 'error');
  }
}

/* ─── SERGİ SİL ──────────────────────────────────────────── */

document.getElementById('btn-delete-exhibition').addEventListener('click', async () => {
  if (!currentExhibition) return;
  const name = document.getElementById('field-name').value || currentExhibition.id;
  if (!confirm(`"${name}" sergisi tamamen silinsin mi? Bu işlem geri alınamaz.`)) return;

  const btn = document.getElementById('btn-delete-exhibition');
  btn.disabled = true;
  btn.textContent = 'Siliniyor…';

  try {
    const files = await ghGet(`images/${currentExhibition.id}`);
    for (const file of files) {
      await ghDelete(
        `images/${currentExhibition.id}/${file.name}`,
        file.sha,
        `Yönetim: ${currentExhibition.id} silindi`
      );
    }
    toast('Sergi silindi.');
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
  const errEl = document.getElementById('modal-error');
  errEl.classList.add('hidden');

  if (!name) {
    errEl.textContent = 'Sergi adı boş olamaz.';
    errEl.classList.remove('hidden');
    return;
  }

  const id = name.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const btn = document.getElementById('btn-modal-create');
  btn.disabled = true;
  btn.textContent = 'Oluşturuluyor…';

  try {
    // Klasörü oluşturmak için .gitkeep dosyası ekle
    await ghPut(
      `images/${id}/.gitkeep`,
      '',
      `Yönetim: ${name} sergisi oluşturuldu`
    );

    // meta.json'a adı kaydet
    await ghPut(
      `images/${id}/meta.json`,
      JSON.stringify({ name }, null, 2),
      `Yönetim: ${name} meta oluşturuldu`
    );

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

  try {
    const file = await fetch(
      `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/config.json`,
      { headers: ghHeaders() }
    );
    if (file.ok) {
      const data = await file.json();
      const config = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))));
      document.getElementById('settings-school-name').value = config.schoolName || '';
    }
  } catch {}

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
    await ghPut(
      'config.json',
      JSON.stringify({ schoolName }, null, 2),
      'Yönetim: okul adı güncellendi'
    );
    document.getElementById('modal-settings').classList.add('hidden');
    toast('Ayarlar kaydedildi. Galeri 1-2 dakika içinde güncellenir.');
  } catch (err) {
    errEl.textContent = 'Kayıt hatası: ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kaydet';
  }
});

/* ─── YARDIMCI ───────────────────────────────────────────── */

function formatFolderName(folder) {
  return folder
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* ─── BAŞLAT ─────────────────────────────────────────────── */

// Önceki oturum varsa devam et
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
