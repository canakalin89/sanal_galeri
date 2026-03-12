// images/ altındaki her klasörü bir sergi olarak tarar.
// Çalıştır: node build.js
// Vercel deploy sırasında otomatik çalışır.
//
// Her sergi klasörüne isteğe bağlı meta.json eklenebilir:
// {
//   "description": "Sergi açıklaması",
//   "year": "2024-2025",
//   "class": "9-A",
//   "artists": { "resim (1).jpeg": "Öğrenci Adı" }
// }

const fs   = require('fs');
const path = require('path');

const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];

function formatName(folder) {
  return folder
    .replace(/^\d+[-_]/, '')          // baştaki "01-" gibi sıra önekini kaldır
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const imagesDir = path.join(__dirname, 'images');
const exhibitions = [];

if (fs.existsSync(imagesDir)) {
  fs.readdirSync(imagesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(dir => {
      // meta.json varsa oku
      let meta = {};
      const metaPath = path.join(imagesDir, dir.name, 'meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch (e) {
          console.warn(`Uyarı: ${dir.name}/meta.json okunamadı — atlanıyor.`);
        }
      }

      const artists = meta.artists || {};

      const files = fs.readdirSync(path.join(imagesDir, dir.name))
        .filter(f => EXTS.includes(path.extname(f).toLowerCase()))
        .map(f => ({
          src:    `images/${dir.name}/${f}`,
          artist: artists[f] || null
        }));

      if (files.length > 0) {
        exhibitions.push({
          id:          dir.name,
          name:        formatName(dir.name),
          description: meta.description || null,
          year:        meta.year        || null,
          class:       meta.class       || null,
          images:      files
        });
      }
    });
}

fs.writeFileSync(
  path.join(__dirname, 'images-list.js'),
  `const EXHIBITIONS = ${JSON.stringify(exhibitions, null, 2)};\n`
);

console.log(`${exhibitions.length} sergi listelendi.`);
