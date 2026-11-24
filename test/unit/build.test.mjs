// Сборка: одна страница со всем внутри, без внешних запросов
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// страница лёгкая (экран загрузки виден сразу), код игры -- отдельным файлом с хэшем, на который она ссылается
const gameFile = () => { const m = /"(game\.[0-9a-f]+\.js)"/.exec(fs.readFileSync('dist/index.html', 'utf8')); return m && 'dist/' + m[1]; };
test('npm run build собирает dist/index.html и код игры', () => { const r = spawnSync('node', ['build.mjs'], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
  const g = gameFile(); assert.ok(g, 'страница ссылается на game.<хэш>.js'); assert.ok(fs.existsSync(g)); assert.ok(fs.statSync(g).size > 1e6); assert.ok(fs.statSync('dist/index.html').size < 1e6); });
test('код игры меньше 16 МБ', () => assert.ok(fs.statSync(gameFile()).size < 16e6));
test('страница не тянет скриптов и стилей со сторонних адресов', () => { const h = fs.readFileSync('dist/index.html', 'utf8'); assert.ok(!/<script[^>]+src=/.test(h)); assert.ok(!/<link[^>]+stylesheet/.test(h)); });
test('страница меньше 16 МБ', () => assert.ok(fs.statSync('dist/index.html').size < 16e6));
