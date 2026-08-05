# Деплой и эксплуатация

Приложение: `https://vin2win.online`
Сервер: Ubuntu, Docker + nginx на хосте.
PostgreSQL — на **отдельном** хосте, в compose контейнера с БД нет.

---

## 1. Первичная настройка сервера

Выполняется один раз, от root.

```bash
# 1. Сгенерируйте SSH-ключ на своей машине, если его нет
ssh-keygen -t ed25519 -C "deploy@vin2win"

# 2. На сервере
git clone https://github.com/hhwwwww1414/call-centre.git /opt/vin2win-crm
cd /opt/vin2win-crm

SSH_PUBKEY="ssh-ed25519 AAAA... deploy@vin2win" ./deploy/harden-vps.sh
```

Скрипт: создаёт пользователя `deploy` с SSH-ключом, ставит Docker, nginx,
certbot, fail2ban, включает `ufw` (открыты только 22/80/443), запрещает вход
root и парольную аутентификацию, настраивает logrotate и автообновления
безопасности.

> **Не закрывайте текущую SSH-сессию**, пока в другом окне не убедитесь,
> что `ssh deploy@<ip>` работает по ключу. Скрипт отключает вход по паролю.

Права на каталог:

```bash
chown -R deploy:deploy /opt/vin2win-crm
```

### Подключение к серверу

После харденинга вход только по ключу и только пользователем `deploy`:

```bash
ssh -i ~/.ssh/vin2win_deploy deploy@<ip>
```

> **Ubuntu 26.04 и старые SSH-клиенты.** Сервер использует OpenSSH 10
> с постквантовым обменом ключами, которого нет в клиентах постарше
> (в том числе во встроенном OpenSSH Windows). Симптом — `choose_kex:
> unsupported KEX method`. Лечится явным указанием алгоритма:
>
> ```bash
> ssh -o KexAlgorithms=curve25519-sha256 -i ~/.ssh/vin2win_deploy deploy@<ip>
> ```
>
> Чтобы не писать это каждый раз, добавьте в `~/.ssh/config`:
>
> ```
> Host vin2win
>     HostName 201.34.133.133
>     User deploy
>     IdentityFile ~/.ssh/vin2win_deploy
>     KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org
> ```
>
> Дальше — просто `ssh vin2win`.
>
> PuTTY и plink читают только формат `.ppk`: ключ нужно один раз
> сконвертировать в PuTTYgen (Conversions → Import key → Save private key).

---

## 2. Переменные окружения

```bash
sudo -u deploy -i
cd /opt/vin2win-crm
cp .env.example .env
nano .env
```

Обязательно заполнить:

| Переменная | Значение |
|---|---|
| `DATABASE_URL` | Строка подключения. Спецсимволы пароля URL-кодировать |
| `NEXTAUTH_URL` | `https://vin2win.online` |
| `APP_URL` | `https://vin2win.online` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `SEED_ADMIN_EMAIL` | Логин первого администратора |
| `SEED_ADMIN_PASSWORD` | Стартовый пароль, сменится при первом входе |
| `TELEPHONY_PROVIDER` | `mock`, пока нет ключей Exolve |
| `NODE_ENV` | `production` |

```bash
chmod 600 .env
```

> `NEXTAUTH_URL` должен начинаться с `https://` — от этого зависит режим
> Secure-кук. Если указать `http://`, браузер не примет сессионную куку
> на боевом домене, и вход не будет работать.

---

## 3. Домен и SSL

DNS: `vin2win.online`, `www.vin2win.online`, `crm.vin2win.online` → A-запись
на IP сервера.

```bash
sudo cp deploy/nginx/vin2win.online.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/vin2win.online.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo mkdir -p /var/www/certbot

sudo certbot --nginx -d vin2win.online -d www.vin2win.online -d crm.vin2win.online
sudo nginx -t && sudo systemctl reload nginx
```

Автопродление certbot ставит сам (systemd timer). Проверка:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

---

## 4. Первый запуск

```bash
cd /opt/vin2win-crm
chmod +x deploy/*.sh

./deploy/deploy.sh          # сборка, миграции, запуск

# Первый администратор — один раз
docker compose run --rm --no-deps --entrypoint '' app \
  node_modules/.bin/tsx prisma/seed.ts
```

Проверка:

```bash
curl -s https://vin2win.online/api/health | jq
```

Ожидается `status: ok`, `database: true`, `realtime: true`.

> `realtime` станет `true`, когда откроется хотя бы один SSE-клиент —
> то есть после первого входа в интерфейс.

---

## 5. Обычный деплой

```bash
ssh deploy@<ip>
cd /opt/vin2win-crm
./deploy/deploy.sh
```

Что происходит: `git pull` → сборка образа → `prisma migrate deploy` в
одноразовом контейнере → `docker compose up -d --wait` (старый контейнер
живёт, пока новый не пройдёт healthcheck) → проверка `/api/health`.

Если healthcheck не прошёл, скрипт покажет логи и завершится с ошибкой —
менять ничего не будет.

Пересобрать текущий код без `git pull`:

```bash
./deploy/deploy.sh --no-pull
```

---

## 6. Откат

```bash
cd /opt/vin2win-crm
git log --oneline -10
git checkout <хеш-рабочего-коммита>
./deploy/deploy.sh --no-pull
```

> **Миграции не откатываются автоматически.** Prisma не умеет `down`.
> Если проблема в схеме — восстанавливайте БД из дампа (раздел 8), а откат
> кода делайте после этого. Поэтому миграции пишите совместимыми:
> сначала добавляем колонку, потом переводим код, и только потом
> удаляем старое — отдельным релизом.

---

## 7. Логи

```bash
# Приложение (структурированный JSON от pino)
docker compose logs -f app
docker compose logs --tail 200 app | jq -R 'fromjson? // .'

# nginx
sudo tail -f /var/log/nginx/vin2win-crm.access.log
sudo tail -f /var/log/nginx/vin2win-crm.error.log

# Бэкапы
tail -f /var/log/vin2win-backup.log

# Состояние
docker compose ps
docker stats --no-stream vin2win-crm
```

Ротация: логи контейнера — json-file, 10 МБ × 5 файлов; nginx и бэкапы —
через logrotate (настроен `harden-vps.sh`).

Секретов в логах нет: pino вырезает пароли, токены и ключи по списку путей
ещё до сериализации.

---

## 8. Бэкапы

Ежедневный дамп, хранение 14 дней.

```bash
crontab -e -u deploy
```

```cron
15 3 * * * /opt/vin2win-crm/deploy/backup-db.sh >> /var/log/vin2win-backup.log 2>&1
```

Ручной запуск и проверка:

```bash
./deploy/backup-db.sh
ls -lh /var/backups/vin2win-crm/
```

### Восстановление

**Проверьте восстановление хотя бы один раз** — непроверенный бэкап
бэкапом не считается (ТЗ 8.5).

Безопасная проверка на отдельной базе:

```bash
TARGET_DATABASE_URL="postgresql://user:pass@host:5432/restore_test" \
  ./deploy/restore-db.sh /var/backups/vin2win-crm/vin2win-crm-YYYYMMDD-HHMMSS.sql.gz
```

В боевую базу (скрипт спросит подтверждение словом `RESTORE`):

```bash
docker compose stop app
./deploy/restore-db.sh /var/backups/vin2win-crm/<файл>.sql.gz
docker compose start app
curl -s https://vin2win.online/api/health
```

---

## 9. Мониторинг

`GET /api/health` — без авторизации, отдаёт:

```json
{
  "status": "ok",
  "version": "a1b2c3d-202608050130",
  "database": true,
  "realtime": true,
  "realtimeClients": 3,
  "telephony": "mock",
  "uptimeSeconds": 3600
}
```

HTTP 200 — всё в порядке, 503 — БД недоступна. Этого достаточно для
внешнего аптайм-мониторинга.

---

## 10. Типичные проблемы

**Приложение не стартует, в логах ошибка подключения к БД.**
Проверьте, что IP сервера разрешён в настройках управляемой БД, и что пароль
в `DATABASE_URL` URL-закодирован.

**Вход не работает: после ввода пароля возвращает на форму.**
`NEXTAUTH_URL` начинается с `http://` вместо `https://` — браузер отбрасывает
Secure-куку. Поправьте и перезапустите контейнер.

**`realtime: false` в health при живых пользователях.**
Слушатель не подключился к Postgres. Смотрите `docker compose logs app | grep realtime`.
Частая причина — TLS: managed-базы отдают самоподписанный сертификат.
Обрабатывается в `lib/realtime/pg-config.ts`; при `sslmode=verify-full`
укажите путь к CA в `PGSSLROOTCERT`.

**События в журнале приходят с задержкой или обрываются.**
Проверьте, что для `/api/events/stream` в nginx стоит `proxy_buffering off`
и `proxy_read_timeout 3600s`.

**Миграция упала на середине.**
`docker compose run --rm --no-deps --entrypoint '' app node_modules/.bin/prisma migrate status`
покажет состояние. Чинить — правкой SQL и повторным `migrate deploy`,
в крайнем случае — восстановлением из дампа.

**Кончилось место.**
`docker system prune -a --volumes` (осторожно), плюс проверьте
`/var/backups/vin2win-crm/`.
