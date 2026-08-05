# VIN2WIN CRM — колл-центр

Внутренняя CRM для учёта звонков: журнал, карточка звонка, дашборды, роли,
realtime-обновление без перезагрузки страницы.

Этап MVP-1: интерфейс, аккаунты и каркас телефонии. Реальная АТС (МТС Exolve)
подключается заменой одной переменной окружения — код к этому готов, см.
[`docs/EXOLVE_INTEGRATION.md`](docs/EXOLVE_INTEGRATION.md).

---

## Стек

| Слой | Технология |
|---|---|
| Фреймворк | Next.js 15 (App Router), TypeScript strict |
| Стили | Tailwind CSS v4 + CSS-переменные |
| Компоненты | Radix UI, свой слой поверх (shadcn-подход) |
| БД | PostgreSQL (внешний хост) |
| ORM | Prisma 6 |
| Auth | Auth.js (NextAuth v5), credentials, JWT в httpOnly cookie |
| Пароли | argon2id (`@node-rs/argon2`) |
| Валидация | Zod + react-hook-form |
| Данные на клиенте | TanStack Query |
| Realtime | SSE + Postgres LISTEN/NOTIFY |
| Графики | Recharts |
| Даты | date-fns + Intl |
| Тесты | Vitest (unit) + Playwright (e2e) |
| Логи | pino |
| Деплой | Docker + docker compose + nginx + certbot |

Пакетный менеджер — **pnpm**. Node — **22+**.

---

## Быстрый старт

```bash
pnpm install
cp .env.example .env       # заполнить значения, см. ниже
pnpm db:migrate            # применить миграции
pnpm db:seed               # создать первого администратора
pnpm seed:calls -- --days=30   # демо-история звонков (не в проде)
pnpm dev                   # http://localhost:3000
```

При первом входе система потребует сменить стартовый пароль.

---

## Переменные окружения

Полный список с комментариями — в [`.env.example`](.env.example).
`.env` в репозиторий не попадает и не должен туда попадать.

| Переменная | Зачем |
|---|---|
| `DATABASE_URL` | Подключение к PostgreSQL. Спецсимволы в пароле — URL-кодировать |
| `NEXTAUTH_URL` / `APP_URL` | Публичный адрес. От схемы (`https://`) зависит режим Secure-кук |
| `AUTH_SECRET` | Подпись сессии. `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | AES-256-GCM для чувствительных настроек. 32 байта в base64 |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Первый администратор для `pnpm db:seed` |
| `TELEPHONY_PROVIDER` | `mock` или `exolve` |
| `EXOLVE_*` | Ключи АТС. Пока пусто — провайдер `mock` |
| `LOG_LEVEL`, `TZ` | Логи и часовой пояс сервера |

> **Про пароль в `DATABASE_URL`.** Он идёт в URL, поэтому `@ : / ? # & =`
> нужно кодировать: `@` → `%40`, `#` → `%23`, `>` → `%3E` и так далее.
> Иначе Prisma разберёт строку не так, как вы ожидали.

---

## Команды

```bash
pnpm dev            # разработка
pnpm build          # прод-сборка (prisma generate + next build)
pnpm start          # запуск собранного приложения

pnpm db:migrate     # prisma migrate deploy — накатить миграции
pnpm db:seed        # первый администратор
pnpm seed:calls     # демо-звонки: -- --days=30 --reset
pnpm db:studio      # Prisma Studio

pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # unit-тесты (Vitest)
pnpm test:e2e       # e2e (Playwright), нужен поднятый сервер
pnpm format         # Prettier
```

### Новая миграция

У пользователя БД может не быть прав на создание shadow-базы — тогда
`prisma migrate dev` не сработает. Рабочий путь:

```bash
pnpm exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$DATABASE_URL" \
  --script > prisma/migrations/<timestamp>_<name>/migration.sql

pnpm db:migrate
```

### e2e локально

```bash
pnpm build && pnpm start          # в отдельном терминале
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
E2E_MANAGER_EMAIL=... E2E_MANAGER_PASSWORD=... \
pnpm test:e2e
```

Без учётных данных сценарии, требующие входа, помечаются `skipped` —
тесты не падают, но и не проверяют ничего содержательного.

---

## Структура

```
app/
  (app)/            защищённая часть: дашборд, звонки, контакты, профиль, /admin/*
  api/              REST: calls, contacts, stats, analytics, users, audit,
                    events/stream (SSE), webhooks/[provider], health
  login/, invite/   публичные страницы
components/
  ui/               примитивы поверх Radix, стилизованные токенами
  calls/, dashboard/, admin/, contacts/, profile/, layout/, theme/, providers/
lib/
  auth/             rbac (requireRole), scope (правила видимости), пароли, rate limit
  telephony/        адаптер: types, ingest, providers/mock, providers/exolve
  realtime/         шина LISTEN/NOTIFY и конфиг подключения слушателя
  services/         запросы к БД: calls, users
  i18n/ru.ts        ВСЕ строки интерфейса
  validation.ts     Zod-схемы — одни на клиент и сервер
prisma/             схема, миграции, сиды
deploy/             nginx, deploy.sh, бэкапы, харденинг VPS
tests/              unit/ и e2e/
docs/               DEPLOY, ADMIN, EXOLVE_INTEGRATION
```

---

## Как всё устроено

### Роли и изоляция данных

Две рабочие роли: `ADMIN` и `MANAGER` (`SUPERVISOR` заложен в схему, в UI не
выводится). Менеджер видит только свои звонки.

Изоляция сделана **на сервере**, не скрытием кнопок:

- `requireRole()` / `requireUser()` вызывается в каждом API-роуте и на каждой
  защищённой странице. Роль читается из БД, а не из токена, — деактивация
  закрывает доступ сразу.
- `callScopeFilter()` подмешивает в `where` жёсткий `userId` менеджера,
  игнорируя всё, что пришло с клиента. Покрыто тестами.
- middleware — только первый рубеж (редирект анонимных, 403 на `/api/admin/*`).

### Realtime

`Call` → триггер `pg_notify('call_events', …)` → одно постоянное подключение
`LISTEN` на процесс → SSE `/api/events/stream` → точечная инвалидация
TanStack Query на клиенте.

В канал уходят только идентификаторы и статусы — ни номеров, ни имён,
ни комментариев. Фильтрация по правам — на сервере, при раздаче событий.

Heartbeat раз в 25 секунд, переподключение с экспоненциальной задержкой,
после восстановления связи — полный рефетч экрана.

> Подключение слушателя настраивается отдельно от Prisma
> (`lib/realtime/pg-config.ts`): при `sslmode=prefer` node-postgres требует
> доверенную цепочку сертификатов и падает на managed-базе с самоподписанным
> сертификатом, а Prisma — нет.

### Телефония

Всё за интерфейсом `TelephonyProvider`. Ни один компонент UI не знает про
Exolve. Выбор — переменной `TELEPHONY_PROVIDER`.

- `mock` — генератор правдоподобных звонков с полным жизненным циклом
  (дозвон → разговор → завершение) и реальными паузами.
- `exolve` — каркас: вебхук, клиент API с ретраями и таймаутом, проверка
  подписи. Места, зависящие от документации провайдера, помечены
  `// TODO(exolve):` и собраны в `docs/EXOLVE_INTEGRATION.md`.

### Темы

Класс на `<body>` (`theme-light` / `theme-dark`), выбор хранится в
`localStorage` + cookie. Cookie читает SSR, инлайновый скрипт в `<head>`
уточняет класс до гидратации — вспышки чужой темы нет.

Все цвета — только через CSS-переменные из `app/globals.css`.
Новых hex-значений в компонентах быть не должно.

---

## Безопасность

- Пароли — argon2id, минимум 10 символов. В БД только хеши.
- Rate limit на вход: 5 попыток / 15 минут на связку IP + логин.
- Сессия — httpOnly + SameSite=Lax, Secure при https, срок 12 часов
  со скользящим продлением.
- Все админские действия пишутся в `AuditLog`.
- Заголовки: CSP, HSTS, `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`.
- Секреты не логируются: pino вырезает их по списку путей до сериализации.
- Ошибки наружу — человеческим текстом, без стектрейсов и SQL.

---

## Документация

- [`docs/DEPLOY.md`](docs/DEPLOY.md) — деплой, откат, логи, бэкапы
- [`docs/ADMIN.md`](docs/ADMIN.md) — инструкция администратора
- [`docs/EXOLVE_INTEGRATION.md`](docs/EXOLVE_INTEGRATION.md) — чек-лист подключения телефонии
- [`vin2win-crm-tz.md`](vin2win-crm-tz.md) — исходное техническое задание
