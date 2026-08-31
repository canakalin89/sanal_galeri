// Kaynakları çalıştırmadan sözdizimini kontrol eder; ek test bağımlılığı gerekmez.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
for (const dir of ['', 'api', 'server', 'scripts', 'tests']) {
  const folder = path.join(root, dir);
  if (!fs.existsSync(folder)) continue;
  for (const name of fs.readdirSync(folder).filter(name => name.endsWith('.js'))) {
    new vm.Script(fs.readFileSync(path.join(folder, name), 'utf8'), { filename: path.join(dir, name) });
  }
}
console.log('JavaScript sözdizimi geçerli.');
