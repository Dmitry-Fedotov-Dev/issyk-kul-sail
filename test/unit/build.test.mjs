// Сборка: одна страница со всем внутри, без внешних запросов
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

test('npm run build собирает dist/index.html', () => { const r = spawnSync('node', ['build.mjs'], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); assert.ok(fs.statSync('dist/index.html').size > 1e6); });
test('страница не тянет скриптов и стилей со сторонних адресов', () => { const h = fs.readFileSync('dist/index.html', 'utf8'); assert.ok(!/<script[^>]+src=/.test(h)); assert.ok(!/<link[^>]+stylesheet/.test(h)); });
test('страница меньше 16 МБ', () => assert.ok(fs.statSync('dist/index.html').size < 16e6));
