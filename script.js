// EXHIBITIONS dizisi images-list.js tarafından sağlanır.
// Yeni sergi: images/<klasor-adi>/ altına görselleri at, node build.js çalıştır.

/* ─── ROUTING (hash tabanlı) ─────────────────────────────── */

function route() {
  const id = location.hash.slice(1);
  const exhibition = EXHIBITIONS.find(e => e.id === id);
  if (id && exhibition) {
    showGallery(exhibition);
  } else {
    showHome();
  }
}

window.addEventListener('hashchange', route);

/* ─── YARDIMCI: alt text üret ────────────────────────────── */

function makeAlt(img, exhibitionName, index) {
  return img.artist
    ? `${exhibitionName} — ${img.artist}`
    : `${exhibitionName}, eser ${index + 1}`;
}

/* ─── ANA SAYFA ──────────────────────────────────────────── */

function showHome() {
  document.getElementById('view-home').classList.remove('hidden');
  document.getElementById('view-gallery').classList.add('hidden');
  document.title = 'Sanal Galeri';

  const container = document.getElementById('exhibitions');
  container.innerHTML = '';

  if (EXHIBITIONS.length === 0) {
    container.innerHTML = '<p class="empty">Henüz sergi eklenmedi.</p>';
    return;
  }

  EXHIBITIONS.forEach(ex => {
    const card = document.createElement('a');
    card.className = 'exhibition-card';
    card.href = `#${ex.id}`;
    card.innerHTML = `
      <div class="card-thumb">
        <img src="${ex.images[0].src}" alt="" loading="lazy" />
      </div>
      <div class="card-info">
        <span class="card-name">${ex.name}</span>
        <span class="card-count">${ex.images.length} eser</span>
      </div>
    `;
    container.appendChild(card);
  });
}

/* ─── GALERİ SAYFASI ─────────────────────────────────────── */

function showGallery(exhibition) {
  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-gallery').classList.remove('hidden');
  document.getElementById('gallery-title').textContent = exhibition.name;
  document.title = `${exhibition.name} — Sanal Galeri`;

  const descEl = document.getElementById('gallery-desc');
  if (exhibition.description) {
    descEl.textContent = exhibition.description;
    descEl.classList.remove('hidden');
  } else {
    descEl.classList.add('hidden');
  }

  const grid = document.getElementById('gallery');
  grid.innerHTML = '';

  exhibition.images.forEach((img, i) => {
    const el = document.createElement('div');
    el.className = 'gallery-item';
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    const altText = makeAlt(img, exhibition.name, i);
    el.setAttribute('aria-label', altText);
    el.innerHTML = `<img src="${img.src}" alt="${altText}" loading="lazy" />`;
    el.addEventListener('click', () => {
      lastFocusedItem = el;
      openLightbox(exhibition.images, i);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        lastFocusedItem = el;
        openLightbox(exhibition.images, i);
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
let lastFocusedItem = null;

function updateLightboxImage() {
  const img = currentImages[currentIndex];
  const lbImg = document.getElementById('lb-img');
  lbImg.src = img.src;
  lbImg.alt = img.artist || '';
  const captionEl = document.getElementById('lb-caption');
  captionEl.textContent = img.artist || '';
}

function openLightbox(images, index) {
  currentImages = images;
  currentIndex  = index;
  updateLightboxImage();
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('lb-close').focus();
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  if (lastFocusedItem) lastFocusedItem.focus();
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

document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').classList.contains('open')) return;
  if (e.key === 'Escape')     closeLightbox();
  if (e.key === 'ArrowLeft')  prev();
  if (e.key === 'ArrowRight') next();
});

/* ─── SWIPE (dokunmatik) ─────────────────────────────────── */

let touchStartX = 0;
const lb = document.getElementById('lightbox');
lb.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].clientX;
}, { passive: true });
lb.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
}, { passive: true });

/* ─── İFRAME: geri butonu gizle ─────────────────────────── */
if (window.self !== window.top) {
  document.getElementById('btn-back').style.display = 'none';
}

/* ─── BAŞLAT ─────────────────────────────────────────────── */
route();
