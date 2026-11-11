// Сборка: весь код, three.js и карта высот -- в один HTML. Никаких внешних запросов при игре.
import { build } from 'esbuild';
import fs from 'node:fs';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2019', legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const page = fs.readFileSync('src/page.html', 'utf8').replace('__LOADIMG__', `url(data:image/jpeg;base64,${fs.readFileSync('src/loading.jpg').toString('base64')})`);
const script = `<script>${js}</script>`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/artifact.html', `<meta name="claude:viewport-fit-sides" content="cover">\n${page}\n${script}\n`);
const [head, ...rest] = page.split('</style>');
fs.writeFileSync('dist/index.html', `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}</style>\n</head>\n<body>\n${rest.join('</style>')}\n${script}\n</body>\n</html>\n`);
console.log('dist/index.html', (fs.statSync('dist/index.html').size / 1e6).toFixed(2), 'MB');
