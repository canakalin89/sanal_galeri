// Yalnızca açıkça izinli ziyaretçi dosyaları yayımlanır; server/, testler ve .env dışarıda kalır.
const fs = require('node:fs');
const path = require('node:path');
const { LIMITS, validateDocument } = require('./server/validation');
const root = fs.realpathSync(__dirname);
const output = path.resolve(root, 'dist');
if (path.dirname(output) !== root || path.basename(output) !== 'dist' || (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())) throw new Error('Güvensiz çıktı yolu.');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const exhibitions = JSON.parse(fs.readFileSync(path.join(root, 'exhibitions.json'), 'utf8'));
validateDocument('config.json', config);
validateDocument('exhibitions.json', exhibitions);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
const files = ['index.html', 'style.css', 'script.js', 'gallery-data.js', 'artwork-tools.js', 'gallery-layout.js', 'gallery-lighting.js', 'gallery-neighborhood.js', 'gallery-weather.js', 'gallery-roof.js', 'gallery-atmosphere.js', 'gallery-game.js', 'gallery-room.js', 'gallery3d.js', 'admin.html', 'admin.css', 'admin-app.js', 'admin-state.js', 'exhibitions.json', 'THIRD_PARTY_ASSETS.md'];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(output, file));
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
fs.mkdirSync(path.join(output, 'vendor'));
fs.copyFileSync(path.join(root, 'vendor', 'three.module.js'), path.join(output, 'vendor', 'three.module.js'));
for (const directory of ['loaders', 'utils', 'draco']) {
  fs.cpSync(path.join(root, 'vendor', directory), path.join(output, 'vendor', directory), { recursive: true });
}
fs.mkdirSync(path.join(output, 'vendor', 'models'));
for (const model of ['plant.glb', 'chandelier.glb']) {
  fs.copyFileSync(path.join(root, 'vendor', 'models', model), path.join(output, 'vendor', 'models', model));
}
fs.writeFileSync(path.join(output, 'images-list.js'), 'const SCHOOL_NAME = ' + JSON.stringify(config.schoolName) + ';\n');
fs.writeFileSync(path.join(output, 'admin-limits.js'), 'const ADMIN_LIMITS = ' + JSON.stringify(LIMITS) + ';\n');
console.log('Doğrulanan statik dosyalar dist/ altında hazır.');
