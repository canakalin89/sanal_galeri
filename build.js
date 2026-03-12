// images/ altındaki her klasörü bir sergi olarak tarar.
// Çalıştır: node build.js
// Vercel deploy sırasında otomatik çalışır.

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
      const files = fs.readdirSync(path.join(imagesDir, dir.name))
        .filter(f => EXTS.includes(path.extname(f).toLowerCase()))
        .map(f => `images/${dir.name}/${f}`);

      if (files.length > 0) {
        exhibitions.push({
          id:     dir.name,
          name:   formatName(dir.name),
          images: files
        });
      }
    });
}

fs.writeFileSync(
  path.join(__dirname, 'images-list.js'),
  `const EXHIBITIONS = ${JSON.stringify(exhibitions, null, 2)};\n`
);

console.log(`${exhibitions.length} sergi listelendi.`);
