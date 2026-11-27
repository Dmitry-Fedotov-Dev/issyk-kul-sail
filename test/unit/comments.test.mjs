// Защита от класса ошибок «комментарий проглотил код»: в однострочном коде легко дописать пояснение `// ...` посреди строки,
// и всё, что после него, молча перестаёт выполняться (так ломались камера вертолёта, эффект окуляра, возврат модели после
// трубы). Ищем после `// ` в строке признаки кода: `; if (`, `; const `, `; x = `, `; f(`... Прозаические описания
// сигнатур с точкой с запятой -- в списке исключений.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const FILES = ['main.js', 'merz.js', 'merzfx.js', 'icebergs.js', 'heli.js', 'helimode.js', 'heliair.js', 'helicam.js', 'helifeed.js', 'helimodel.js', 'sar.js', 'sarmode.js', 'sartoon.js', 'toon.js', 'spyglass.js', 'post.js', 'audio.js', 'channel.js', 'net.js'];
const PROSE = [/ctl: \{ fwd -1\.\.1/];
test('код не спрятан за // посреди строки (вертолёт, поиск, труба, звук, кадр)', () => {
  const bad = [];
  for (const f of FILES) fs.readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8').split('\n').forEach((l, i) => {
    const j = l.indexOf('// '); if (j < 0) return; const pre = l.slice(0, j); if (!pre.trim()) return; /* строка целиком -- комментарий: кода в ней нет */ if ((pre.match(/`/g) || []).length % 2 || (pre.match(/'/g) || []).length % 2 || /https?:$/.test(pre)) return;
    const tail = l.slice(j + 3); if (PROSE.some((r) => r.test(tail))) return;
    if (/[;}]\s*(if \(|const |let |for \(|return |[A-Za-z_$][\w$]*(\.[\w$]+)*\s*(=[^=>]|\())/.test(tail) || /\sif \(\S|\sconst [\w$]+ = /.test(tail) || /(^|\s)[a-zA-Z_$][\w$]*, [a-zA-Z_$][\w$]*: [\w{(]/.test(tail)) bad.push(`${f}:${i + 1}  ${tail.slice(0, 90)}`); });
  assert.deepEqual(bad, [], 'код после комментария не выполняется:\n' + bad.join('\n'));
});
