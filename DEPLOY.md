# Развёртывание «Паруса Иссык-Куля» на VPS — инструкция для агента

Ты разворачиваешь браузерную игру с сетевым сервером на чистом VPS. Работай по шагам, после каждого шага
проверяй результат командой из раздела «Проверка». Если чего-то из «Входных данных» нет — спроси у человека,
не придумывай.

## Входные данные (запросить у человека)

1. IP-адрес VPS и SSH-доступ (пользователь с `sudo` или `root`).
2. Архив `issyk-sail-src.zip` (лежит у человека; загрузить на сервер через `scp`).
3. Доменное имя, направленное A-записью на IP сервера — **необязательно**. Без домена игра будет работать
   по `http://<IP>`, без HTTPS.

## Что это за приложение

- Один процесс Node.js: `server.js`. Сторонних npm-пакетов для работы **не нужно** — только Node.js.
- Раздаёт страницу `dist/index.html` (уже собрана и лежит в архиве) и держит WebSocket на пути `/ws`
  для сетевой игры. `GET /health` отдаёт `{"online": N}` — число подключённых.
- Порт задаётся переменной `PORT` (по умолчанию 8080). Наружу этот порт не открывать: снаружи — только
  обратный прокси на 80/443.
- Лимиты внутри `server.js`: до 400 подключений, сообщение клиента не больше 2 КБ.

## Шаги

Целевая ОС — Ubuntu 22.04/24.04 или Debian 12. Для других дистрибутивов замени менеджер пакетов.

### 1. Система и Node.js

```bash
sudo apt-get update
sudo apt-get install -y curl unzip ca-certificates
# Node.js 20 LTS из официального репозитория NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # ожидается v20.x или новее (минимум v18)
```

### 2. Пользователь и файлы

```bash
sudo useradd --system --home /opt/issyk-sail --shell /usr/sbin/nologin issyk || true
sudo mkdir -p /opt/issyk-sail
# архив предварительно загружен: scp issyk-sail-src.zip user@VPS:/tmp/
sudo unzip -o /tmp/issyk-sail-src.zip -d /opt/issyk-sail
sudo chown -R issyk:issyk /opt/issyk-sail
ls -la /opt/issyk-sail/dist/index.html   # файл должен существовать, около 2,3 МБ
```

Пересборка не нужна. Если человек просит собрать из исходников: `cd /opt/issyk-sail && sudo -u issyk npm ci
|| sudo -u issyk npm install && sudo -u issyk npm run build` (понадобятся пакеты three и esbuild из npm).

### 3. Служба systemd

Создай `/etc/systemd/system/issyk-sail.service`:

```ini
[Unit]
Description=Issyk-Kul Sail game server
After=network-online.target
Wants=network-online.target

[Service]
User=issyk
Group=issyk
WorkingDirectory=/opt/issyk-sail
Environment=PORT=8080
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/issyk-sail/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadOnlyPaths=/opt/issyk-sail

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now issyk-sail
sudo systemctl status issyk-sail --no-pager
curl -s http://127.0.0.1:8080/health   # ожидается {"online":0}
```

### 4. Обратный прокси

Выбери **один** вариант. Caddy проще: сам получает сертификат и сам пробрасывает WebSocket.

**Вариант A — Caddy (рекомендуется)**

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

`/etc/caddy/Caddyfile` — с доменом (HTTPS выдаётся автоматически):

```
game.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:8080
}
```

Без домена замени первую строку на `:80`. Затем `sudo systemctl reload caddy`.

**Вариант B — nginx**

```bash
sudo apt-get install -y nginx
```

`/etc/nginx/sites-available/issyk-sail`:

```nginx
server {
    listen 80;
    server_name game.example.com;   # или _ без домена

    gzip on;
    gzip_types text/html application/javascript application/json;

    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/issyk-sail /etc/nginx/sites-enabled/issyk-sail
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
# HTTPS при наличии домена:
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d game.example.com --non-interactive --agree-tos -m <email-человека> --redirect
```

Блок `location /ws` с заголовками `Upgrade` и `Connection` обязателен: без него страница откроется,
но сетевая игра молча не подключится.

### 5. Файрвол

```bash
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

Порт 8080 наружу не открывать.

## Проверка

Выполни все пункты и приложи вывод в отчёт человеку.

```bash
# 1. служба жива
systemctl is-active issyk-sail                      # active
# 2. сервер отвечает локально
curl -s http://127.0.0.1:8080/health                # {"online":0}
# 3. страница отдаётся снаружи через прокси
curl -sI https://game.example.com/ | head -1        # HTTP/2 200 (или http://<IP>/ без домена)
curl -s https://game.example.com/ | grep -c "<title>Парус Иссык-Куля</title>"   # 1
# 4. WebSocket проходит через прокси (ожидается приветствие {"t":"hi","id":...})
cat > /tmp/wscheck.mjs <<'EOF'
const ws = new WebSocket(process.argv[2]);
ws.onmessage = (e) => { console.log('OK', e.data); process.exit(0); };
ws.onerror = (e) => { console.log('FAIL', e.message || e.type); process.exit(1); };
setTimeout(() => { console.log('FAIL timeout'); process.exit(1); }, 5000);
EOF
node /tmp/wscheck.mjs wss://game.example.com/ws     # без домена: ws://<IP>/ws
```

Встроенный `WebSocket` в Node появился в v22. На v20 запусти проверку как
`node --experimental-websocket /tmp/wscheck.mjs ...`.

Финальная ручная проверка (попроси человека): открыть адрес в двух браузерах, выбрать одинаковый снаряд,
нажать «Свободное плавание» — в правом верхнем углу появится «в сети 2», а лодки увидят друг друга,
если стоят рядом (в пределах 1,8 км).

## Обновление игры

```bash
scp issyk-sail-src.zip user@VPS:/tmp/
sudo unzip -o /tmp/issyk-sail-src.zip -d /opt/issyk-sail
sudo chown -R issyk:issyk /opt/issyk-sail
sudo systemctl restart issyk-sail
curl -s http://127.0.0.1:8080/health
```

Перезапуск разрывает текущие сетевые сессии на несколько секунд; клиенты переподключаются сами.

## Диагностика

| Симптом | Что проверить |
|---|---|
| 502 от прокси | `systemctl status issyk-sail`, `journalctl -u issyk-sail -n 50` |
| «dist/index.html не найден» | архив распакован не в `/opt/issyk-sail` или без папки `dist` |
| Страница есть, «в сети» не появляется | WebSocket не проходит прокси: проверь блок `/ws` (nginx) и пункт 4 проверки |
| Сертификат не выдаётся | A-запись домена не указывает на IP или закрыт порт 80 |

## Чего не делать

- Не открывать порт 8080 наружу и не запускать сервер от root.
- Не менять `server.js` и игру без просьбы человека.
- Не устанавливать pm2, Docker и прочее сверх описанного без просьбы: systemd достаточно.
