// Разработка: npm run dev -> сборка, сервер игры (с сетевой игрой) и пересборка при каждом изменении в src/.
// Открытая страница перезагружается сама. Телефон в той же Wi-Fi сети -- по адресу «в сети», который напечатается.
//   PORT=3000 npm run dev -- другой порт
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os';
const port = process.env.PORT || 8080;
const build = () => { const t = Date.now(), r = spawnSync(process.execPath, ['build.mjs'], { encoding: 'utf8' });
  if (r.status) { console.log('\x1b[31m✗ сборка упала:\x1b[0m\n' + (r.stderr || r.stdout).trim()); return false; } console.log(`\x1b[32m✓ собрано за ${Date.now() - t} мс\x1b[0m — страница перезагрузится`); return true; };
let srv = null; const serve = () => { if (srv) srv.kill(); srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, DEV: '1', PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit'] }); };
build(); serve();
const lan = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
console.log(`\nИгра:      http://localhost:${port}\n${lan.map((a) => `В сети:    http://${a}:${port}   (телефон в той же Wi-Fi)`).join('\n')}\nСлежу за src/ — сохраните файл, и игра пересоберётся. Ctrl+C — выход\n`);
let t = null; const again = () => { clearTimeout(t); t = setTimeout(build, 150); };
fs.watch('src', { recursive: true }, (e, f) => { if (f && !/\.swp$|~$/.test(f)) again(); });
fs.watch('build.mjs', again); fs.watch('server.js', () => { clearTimeout(t); t = setTimeout(() => { console.log('server.js изменён — перезапускаю сервер'); serve(); }, 150); });
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { if (srv) srv.kill(); process.exit(0); });
