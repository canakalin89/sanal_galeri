// config.json'dan okul adını okuyup images-list.js dosyasına yazar.
// Çalıştır: node build.js
// Vercel deploy sırasında otomatik çalışır.
//
// Sergiler artık images/ klasöründen değil, tamamen Google Drive'dan
// (exhibitions.json + api/drive.js aracılığıyla) canlı olarak çekilir.

const fs   = require('fs');
const path = require('path');

let schoolName = 'Sanal Galeri';
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.schoolName) schoolName = config.schoolName;
  } catch (e) {
    console.warn('Uyarı: config.json okunamadı.');
  }
}

fs.writeFileSync(
  path.join(__dirname, 'images-list.js'),
  `const SCHOOL_NAME = ${JSON.stringify(schoolName)};\n`
);

console.log('images-list.js oluşturuldu. Okul adı: ' + schoolName);
