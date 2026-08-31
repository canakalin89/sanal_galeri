// Tüm sergiler Google Drive'dan canlı çekilir.
// exhibitions.json → sergi metadata'sı (ad, açıklama, Drive klasör ID'si)

/* ─── DRIVE YARDIMCILARI ─────────────────────────────────── */

function driveImgUrl(fileId, width) {
  return 'https://lh3.googleusercontent.com/d/' + fileId + '=w' + (width || 1600);
}

const galleryData = GalleryData.createClient();

async function resolveDriveExhibitionImages(ex, force = false) {
  const files = await galleryData.getFiles(ex.driveFolderId, force);
  const metaImages = ex.images || {};
  return files.map(f => {
    const m = metaImages[f.id] || {};
    return {
      src: driveImgUrl(f.id, 1600),
      thumbSrc: driveImgUrl(f.id, 480),
      title: m.title || null,
      caption: m.caption || null,
      artist: m.artist || null
    };
  });
}

/* ─── SERGİ LİSTESİ ──────────────────────────────────────── */

let ALL_EXHIBITIONS = [];
let exhibitionsReady = false;
let galleryViewVersion = 0;
let routeVersion = 0;
let coverObserver = null;

async function loadExhibitionsMeta() {
  ALL_EXHIBITIONS = await galleryData.getCatalog();
  exhibitionsReady = true;
}

function findExhibitionMeta(id) {
  return ALL_EXHIBITIONS.find(e => e.id === id) || null;
}

/* ─── ROUTING (hash tabanlı) ─────────────────────────────── */

async function route() {
  const version = ++routeVersion;
  galleryViewVersion++;
  coverObserver?.disconnect();
  closeLightbox();
  window.closeGallery3D?.();
  try {
    if (!exhibitionsReady) await loadExhibitionsMeta();
  } catch (error) {
    if (version !== routeVersion) return;
    showHome(error.message);
    return;
  }
  if (version !== routeVersion) return;
  const id = location.hash.slice(1);
  const exhibition = id ? findExhibitionMeta(id) : null;
  if (exhibition) {
    showGallery(exhibition);
  } else if (id) {
    showHome(null, true);
  } else {
    showHome();
  }
}

window.addEventListener('hashchange', route);

/* ─── YARDIMCI ───────────────────────────────────────────── */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function makeLabel(img, exhibitionName, index) {
  if (img.title) return img.title;
  if (img.artist) return exhibitionName + ' — ' + img.artist;
  return exhibitionName + ', eser ' + (index + 1);
}

/* ─── ANA SAYFA ──────────────────────────────────────────── */

function showMessage(container, title, message, action, label = 'Tekrar dene') {
  container.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'gallery-error';
  panel.setAttribute('role', 'status');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const description = document.createElement('p');
  description.textContent = message;
  panel.append(heading, description);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-retry';
    button.textContent = label;
    button.addEventListener('click', action);
    panel.appendChild(button);
  }
  container.appendChild(panel);
}

function showHome(error = null, missing = false) {
  const version = ++galleryViewVersion;
  coverObserver?.disconnect();
  document.getElementById('view-home').classList.remove('hidden');
  document.getElementById('view-gallery').classList.add('hidden');
  document.getElementById('site-header').classList.remove('hidden');
  document.title = typeof SCHOOL_NAME !== 'undefined' ? 'Sanal Sergi — ' + SCHOOL_NAME : 'Sanal Sergi';

  const statCount = document.getElementById('stat-count');
  if (statCount) statCount.textContent = error ? '—' : ALL_EXHIBITIONS.length;

  const container = document.getElementById('exhibitions');
  container.innerHTML = '';

  if (error) {
    showMessage(container, 'Sergiler yüklenemedi', error, () => {
      showMessage(container, 'Sergiler yükleniyor…', 'Lütfen bekleyin.');
      route();
    });
    return;
  }
  if (missing) {
    showMessage(container, 'Sergi bulunamadı', 'Bu bağlantı eski olabilir veya sergi kaldırılmış olabilir.', () => { location.hash = ''; }, 'Tüm sergilere dön');
    return;
  }

  if (ALL_EXHIBITIONS.length === 0) {
    container.innerHTML = '<p class="empty"><span class="empty-icon">&#127912;</span>Henüz sergi eklenmedi.</p>';
    return;
  }

  const coverLoaders = new WeakMap();
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      coverLoaders.get(entry.target)?.();
    }
  }, { rootMargin: '300px' }) : null;
  coverObserver = observer;

  ALL_EXHIBITIONS.forEach((ex, idx) => {
    const card = document.createElement('a');
    card.className = 'exhibition-card';
    card.href = '#' + ex.id;
    card.style.animationDelay = Math.min(idx * 0.07, 0.5) + 's';

    const yearBadge = ex.year ? '<span class="card-year-badge">' + escapeHtml(ex.year) + '</span>' : '';
    const descHtml = ex.description ? '<p class="card-desc">' + escapeHtml(ex.description) + '</p>' : '';

    card.innerHTML =
      '<div class="card-thumb skeleton"></div>' +
      '<div class="card-info">' +
        '<span class="card-name">' + escapeHtml(ex.name) + '</span>' +
        descHtml +
        '<div class="card-meta"><span class="card-count">Yükleniyor…</span></div>' +
      '</div>';

    container.appendChild(card);

    const thumbEl = card.querySelector('.card-thumb');
    const countEl = card.querySelector('.card-count');

    const loadCover = () => resolveDriveExhibitionImages(ex)
      .then(images => {
        if (version !== galleryViewVersion) return;
        thumbEl.classList.remove('skeleton');
        if (images.length > 0) {
          thumbEl.innerHTML =
            '<img src="' + (images[0].thumbSrc || images[0].src) + '" alt="' + escapeAttr(ex.name) + '" loading="lazy" />' +
            yearBadge;
        } else {
          thumbEl.innerHTML = yearBadge;
        }
        countEl.textContent = images.length + ' eser';
      })
      .catch(() => {
        if (version !== galleryViewVersion) return;
        thumbEl.classList.remove('skeleton');
        countEl.textContent = 'Önizleme yüklenemedi · Sergiyi açıp tekrar deneyin';
      });
    coverLoaders.set(card, loadCover);
    if (observer) observer.observe(card);
    else loadCover();
  });
}

/* ─── GALERİ SAYFASI ─────────────────────────────────────── */

async function showGallery(exhibition, force = false) {
  const version = ++galleryViewVersion;
  coverObserver?.disconnect();
  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-gallery').classList.remove('hidden');
  document.getElementById('site-header').classList.add('hidden');
  document.getElementById('gallery-title').textContent = exhibition.name;
  document.title = exhibition.name + ' — Sanal Sergi';

  const descEl = document.getElementById('gallery-desc');
  if (exhibition.description) {
    descEl.textContent = exhibition.description;
    descEl.classList.remove('hidden');
  } else {
    descEl.classList.add('hidden');
  }

  const countEl = document.getElementById('gallery-count');
  countEl.textContent = '';
  const refresh = document.getElementById('btn-refresh');
  refresh.disabled = true;
  refresh.onclick = () => showGallery(exhibition, true);

  const btn3d = document.getElementById('btn-3d');
  btn3d.classList.add('hidden');

  const grid = document.getElementById('gallery');
  window.scrollTo({ top: 0, behavior: 'instant' });

  grid.classList.add('gallery-state');
  grid.innerHTML = '<div class="gallery-loading" role="status"><div class="spinner"></div><p>Sergi yükleniyor…</p></div>';
  let images;
  try {
    images = await resolveDriveExhibitionImages(exhibition, force);
  } catch (err) {
    if (version !== galleryViewVersion) return;
    refresh.disabled = false;
    showMessage(grid, 'Sergi yüklenemedi', err.message, () => showGallery(exhibition, true));
    if (force) refresh.focus({ preventScroll: true });
    return;
  }

  if (version !== galleryViewVersion) return;
  refresh.disabled = false;
  if (force) refresh.focus({ preventScroll: true });
  countEl.textContent = images.length + ' eser';
  grid.innerHTML = '';

  if (images.length === 0) {
    showMessage(grid, 'Bu sergide henüz eser yok.', 'Yeni eserler eklendiyse listeyi yenileyebilirsiniz.', () => showGallery(exhibition, true), 'Eserleri yenile');
    return;
  }

  grid.classList.remove('gallery-state');
  btn3d.classList.remove('hidden');
  btn3d.onclick = () => open3DGallery(images, exhibition.name, exhibition.description);

  images.forEach((img, i) => {
    const el = document.createElement('div');
    el.className = 'gallery-item';
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.style.animationDelay = Math.min(i * 0.03, 0.6) + 's';
    const label = makeLabel(img, exhibition.name, i);
    el.setAttribute('aria-label', label);

    let overlayHtml = '';
    if (img.title || img.artist) {
      overlayHtml =
        '<div class="gallery-item-overlay">' +
          (img.title ? '<span class="gallery-item-title">' + escapeHtml(img.title) + '</span>' : '') +
          (img.artist ? '<span class="gallery-item-artist">' + escapeHtml(img.artist) + '</span>' : '') +
        '</div>';
    }

    el.innerHTML =
      '<img src="' + (img.thumbSrc || img.src) + '" alt="' + escapeAttr(label) + '" loading="lazy" />' +
      overlayHtml;

    el.addEventListener('click', () => {
      lastFocusedItem = el;
      openLightbox(images, i, exhibition.name);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        lastFocusedItem = el;
        openLightbox(images, i, exhibition.name);
      }
    });
    grid.appendChild(el);
  });
}

document.getElementById('btn-back').addEventListener('click', () => {
  location.hash = '';
});

/* ─── LİGHTBOX ───────────────────────────────────────────── */

let currentImages = [];
let currentIndex  = 0;
let currentExName = '';
let lastFocusedItem = null;
let releaseLightbox = null;
let lightboxLoad = 0;

// Pencere dışını geçici olarak devre dışı bırakır; kapanınca önceki odağı geri verir.
window.activateGalleryModal = function (dialog) {
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.overflow;
  const siblings = [...document.body.children].filter(node => node !== dialog);
  const inertStates = siblings.map(node => node.inert);
  siblings.forEach(node => { node.inert = true; });
  document.body.style.overflow = 'hidden';
  const controller = new AbortController();
  const controls = () => [...dialog.querySelectorAll('button, [href], [tabindex="0"]')]
    .filter(node => !node.disabled && node.getClientRects().length);
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = controls();
    const index = items.indexOf(document.activeElement);
    event.preventDefault();
    const nextIndex = index < 0 ? (event.shiftKey ? items.length - 1 : 0)
      : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
    (items[nextIndex] || dialog).focus();
  }, { signal: controller.signal });
  (controls()[0] || dialog).focus();
  return () => {
    controller.abort();
    siblings.forEach((node, index) => { node.inert = inertStates[index]; });
    document.body.style.overflow = previousOverflow;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
};

function updateLightboxImage() {
  const img = currentImages[currentIndex];
  const lbImg = document.getElementById('lb-img');
  const status = document.getElementById('lb-status');
  const request = ++lightboxLoad;
  status.textContent = 'Görsel yükleniyor…';
  lbImg.classList.add('hidden');
  document.getElementById('lb-retry').classList.add('hidden');
  const pending = new Image();
  pending.onload = () => {
    if (request !== lightboxLoad) return;
    lbImg.src = img.src;
    lbImg.classList.remove('hidden');
    status.textContent = '';
  };
  pending.onerror = () => {
    if (request !== lightboxLoad) return;
    status.textContent = 'Görsel yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.';
    document.getElementById('lb-retry').classList.remove('hidden');
  };
  pending.src = img.src;
  lbImg.alt = makeLabel(img, currentExName, currentIndex);
  document.getElementById('lb-title').textContent = img.title || '';
  document.getElementById('lb-caption').textContent = img.caption || '';
  document.getElementById('lb-artist').textContent = img.artist || '';
  document.getElementById('lb-counter').textContent = (currentIndex + 1) + ' / ' + currentImages.length;
  document.getElementById('lb-prev').disabled = currentImages.length < 2;
  document.getElementById('lb-next').disabled = currentImages.length < 2;
}

function openLightbox(images, index, exhibitionName) {
  if (!images.length) return;
  currentImages = images;
  currentIndex  = index;
  currentExName = exhibitionName || '';
  updateLightboxImage();
  document.getElementById('lightbox').classList.add('open');
  if (!releaseLightbox) releaseLightbox = window.activateGalleryModal(document.getElementById('lightbox'));
}

function closeLightbox() {
  if (!releaseLightbox) return;
  lightboxLoad++;
  document.getElementById('lightbox').classList.remove('open');
  releaseLightbox();
  releaseLightbox = null;
  if (lastFocusedItem?.isConnected) lastFocusedItem.focus({ preventScroll: true });
}

function prev() {
  currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
  updateLightboxImage();
}

function next() {
  currentIndex = (currentIndex + 1) % currentImages.length;
  updateLightboxImage();
}

document.getElementById('lb-close').addEventListener('click', closeLightbox);
document.getElementById('lb-overlay').addEventListener('click', closeLightbox);
document.getElementById('lb-prev').addEventListener('click', prev);
document.getElementById('lb-next').addEventListener('click', next);
document.getElementById('lb-retry').addEventListener('click', updateLightboxImage);

document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').classList.contains('open')) return;
  if (['Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  if (e.key === 'Escape')     closeLightbox();
  if (e.key === 'ArrowLeft')  prev();
  if (e.key === 'ArrowRight') next();
});

/* ─── SWIPE (dokunmatik) ─────────────────────────────────── */

let swipeStart = null;
const lb = document.getElementById('lightbox');
lb.addEventListener('touchstart', e => {
  if (e.touches.length !== 1 || !e.target.closest('.lb-img')) { swipeStart = null; return; }
  const touch = e.changedTouches[0];
  swipeStart = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
}, { passive: true });
lb.addEventListener('touchend', e => {
  if (!swipeStart) return;
  const touch = [...e.changedTouches].find(t => t.identifier === swipeStart.id);
  if (!touch) return;
  const dx = touch.clientX - swipeStart.x;
  const dy = touch.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { dx < 0 ? next() : prev(); }
}, { passive: true });
lb.addEventListener('touchcancel', () => { swipeStart = null; }, { passive: true });

/* ─── 3D SANAL SERGİ SALONU (lazy-load) ──────────────────── */

let gallery3DLoading = null;

function loadGallery3DScript() {
  if (window.openGallery3D) return Promise.resolve();
  if (gallery3DLoading) return gallery3DLoading;
  gallery3DLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'gallery3d.js';
    s.onload = resolve;
    s.onerror = () => { gallery3DLoading = null; reject(new Error('gallery3d.js yüklenemedi')); };
    document.body.appendChild(s);
  });
  return gallery3DLoading;
}

async function open3DGallery(images, exhibitionName, exhibitionDescription) {
  const btn = document.getElementById('btn-3d');
  const originalText = btn.textContent;
  const openingHash = location.hash;
  btn.disabled = true;
  btn.textContent = 'Yükleniyor…';
  try {
    await loadGallery3DScript();
    if (location.hash !== openingHash) return;
    // Modal odağı kapanışta dönebilsin; yükleme boyunca düğme zaten arka planda inert olur.
    btn.disabled = false;
    await window.openGallery3D(images, exhibitionName, exhibitionDescription);
  } catch (err) {
    alert('3D salon açılamadı. Bağlantınızı ve tarayıcınızın WebGL desteğini kontrol edin. 2D galeriyi kullanmaya devam edebilirsiniz.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.getElementById('gal3d-close').addEventListener('click', () => {
  window.closeGallery3D?.();
});

/* ─── EMBED MODU ─────────────────────────────────────────── */

const isEmbed = window.self !== window.top ||
  new URLSearchParams(location.search).get('embed') === '1';

if (isEmbed) {
  document.body.classList.add('embed-mode');
  document.getElementById('btn-back').style.display = 'none';
}

/* ─── BAŞLAT ─────────────────────────────────────────────── */
route();
