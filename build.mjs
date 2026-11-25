// Сборка: весь код, three.js и карта высот -- в один скрипт. Никаких внешних запросов при игре.
//  * dist/index.html -- лёгкая страница: экран загрузки виден сразу, а код игры (dist/game.<хэш>.js, ~6.6 МБ) качается
//    с прогрессом «Загружаем игру: 2.1 из 6.6 МБ». Раньше весь код лежал внутри страницы, и пока он качался по медленному
//    каналу, экран стоял на «Поднимаем паруса…» без признаков жизни -- выглядело как зависание.
//    Хэш в имени меняется с каждой сборкой: файл можно кэшировать навсегда, повторный заход не качает его заново.
//  * dist/artifact.html -- по-прежнему один файл со всем внутри.
import { build } from 'esbuild';
import fs from 'node:fs';
import crypto from 'node:crypto';
// поток атласа облаков -- отдельной сборкой, встраивается строкой (облака генерируются, не трогая кадры)
const cw = await build({ entryPoints: ['src/cloudworker.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2019', legalComments: 'none' });
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2019', legalComments: 'none', define: { __CLOUD_WORKER__: JSON.stringify(cw.outputFiles[0].text) } });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const page = fs.readFileSync('src/page.html', 'utf8').replace('__LOADIMG__', `url(data:image/jpeg;base64,${fs.readFileSync('src/loading.jpg').toString('base64')})`);
fs.mkdirSync('dist', { recursive: true });
fs.copyFileSync('src/landcover.png', 'dist/landcover.png'); fs.copyFileSync('src/khan.png', 'dist/khan.png'); // рельеф района Хан-Тенгри: грузится при входе в район // маска природных зон: грузится по требованию (подзорная труба)
fs.writeFileSync('dist/artifact.html', `<meta name="claude:viewport-fit-sides" content="cover">\n${page}\n<script>${js}</script>\n`);
// код игры -- отдельным файлом с хэшем; старые сборки убираем
const hash = crypto.createHash('sha1').update(js).digest('hex').slice(0, 10), name = `game.${hash}.js`, size = Buffer.byteLength(js);
for (const f of fs.readdirSync('dist')) if (/^game\.[0-9a-f]+\.js$/.test(f) && f !== name) fs.unlinkSync('dist/' + f);
// пишем атомарно (во временный файл и переименование): сервер не прочтёт недописанный файл посреди пересборки;
// тот же хэш -- файл уже такой, не трогаем
const put = (f, data) => { const tmp = f + '.tmp' + process.pid; fs.writeFileSync(tmp, data); fs.renameSync(tmp, f); };
if (!fs.existsSync('dist/' + name) || fs.statSync('dist/' + name).size !== size) put('dist/' + name, js);
// загрузчик: качает код с прогрессом и запускает; с диска (file://) или без потоков fetch -- обычным <script src>
const loader = `<script>(function(){var src=${JSON.stringify(name)},size=${size},m=document.getElementById('loadmsg'),f=document.getElementById('loadfill'),mb=function(b){return (b/1048576).toFixed(1)};
function tag(){var s=document.createElement('script');s.src=src;s.onerror=function(){m.textContent='Не удалось скачать игру. Проверьте интернет и нажмите, чтобы попробовать ещё раз';var L=document.getElementById('load');L.style.cursor='pointer';L.onclick=function(){location.reload()}};document.body.appendChild(s)}
if(location.protocol==='file:'||!window.fetch||!window.ReadableStream||!window.TextDecoder){tag();return}
m.textContent='Загружаем игру…';
fetch(src).then(function(r){if(!r.ok||!r.body)throw 0;var rd=r.body.getReader(),dec=new TextDecoder(),parts=[],got=0;
 return (function pump(){return rd.read().then(function(x){if(x.done){parts.push(dec.decode());var s=document.createElement('script');s.text=parts.join('');document.body.appendChild(s);return}
  got+=x.value.length;parts.push(dec.decode(x.value,{stream:true}));m.textContent='Загружаем игру: '+mb(got)+' из '+mb(size)+' МБ';f.style.width=(Math.min(1,got/size)*16)+'%';return pump()})})()}).catch(tag)})();</script>`;
const [head, ...rest] = page.split('</style>');
put('dist/index.html', `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}</style>\n</head>\n<body>\n${rest.join('</style>')}\n${loader}\n</body>\n</html>\n`);
console.log('dist/index.html', (fs.statSync('dist/index.html').size / 1e6).toFixed(2), 'MB +', name, (size / 1e6).toFixed(2), 'MB');
