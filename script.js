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
      <div class="card-thumb" style="background-image: url('${ex.images[0]}')"></div>
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

  const grid = document.getElementById('gallery');
  grid.innerHTML = '';

  exhibition.images.forEach((src, i) => {
    const el = document.createElement('div');
    el.className = 'gallery-item';
    el.innerHTML = `<img src="${src}" alt="" loading="lazy" />`;
    el.addEventListener('click', () => openLightbox(exhibition.images, i));
    grid.appendChild(el);
  });
}

document.getElementById('btn-back').addEventListener('click', () => {
  location.hash = '';
});

/* ─── LİGHTBOX ───────────────────────────────────────────── */

let currentImages = [];
let currentIndex  = 0;

function openLightbox(images, index) {
  currentImages = images;
  currentIndex  = index;
  document.getElementById('lb-img').src = currentImages[currentIndex];
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

function prev() {
  currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
  document.getElementById('lb-img').src = currentImages[currentIndex];
}

function next() {
  currentIndex = (currentIndex + 1) % currentImages.length;
  document.getElementById('lb-img').src = currentImages[currentIndex];
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

/* ─── İFRAME: geri butonu gizle ─────────────────────────── */
if (window.self !== window.top) {
  document.getElementById('btn-back').style.display = 'none';
}

/* ─── BAŞLAT ─────────────────────────────────────────────── */
route();
