// Физика яхты и снарядов: каждая проверка из test/polar.mjs и test/crafts.mjs -- отдельный тест в отчёте JUnit.
// Сами скрипты остаются как были (их удобно запускать руками); здесь они выполняются целиком, а строки «ok» / «FAIL»
// становятся тестами с понятными именами.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const [suite, file] of [['поляра яхты', 'test/polar.mjs'], ['снаряды', 'test/crafts.mjs'], ['параплан', 'test/para.mjs']]) {
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 600000 });
  const checks = r.stdout.split('\n').filter((l) => /^(ok|FAIL) /.test(l));
  test(`${suite}: скрипт отработал`, () => { assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr.slice(-2000)); assert.ok(checks.length > 0, 'нет ни одной проверки'); });
  for (const l of checks) test(`${suite}: ${l.slice(5).trim()}`, () => { assert.ok(l.startsWith('ok'), l); });
}
