// Локальный сервер без зависимостей: node server.js  ->  http://localhost:8080
const http = require('http'), fs = require('fs'), path = require('path');
const port = process.env.PORT || 8080, file = path.join(__dirname, 'dist', 'index.html');
http.createServer((req, res) => {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(500); res.end('dist/index.html не найден: сначала npm run build'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(data);
  });
}).listen(port, () => console.log(`Парус Иссык-Куля: http://localhost:${port}`));
