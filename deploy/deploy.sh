#!/usr/bin/env bash
# Деплой VIN2WIN CRM: pull → build → миграции → перезапуск.
# Запускать на сервере из каталога приложения от пользователя deploy.
#
#   ./deploy/deploy.sh              # обычный деплой
#   ./deploy/deploy.sh --no-pull    # пересобрать текущий код
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

log()  { printf '\033[0;32m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[deploy]\033[0m %s\n' "$*"; }
die()  { printf '\033[0;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || die 'Нет файла .env — скопируйте .env.example и заполните значения'

# Секреты не должны утечь в лог: читаем .env, но ничего из него не печатаем
set -a
# shellcheck disable=SC1091
source .env
set +a

[[ -n "${DATABASE_URL:-}" ]] || die 'В .env не задан DATABASE_URL'
[[ -n "${AUTH_SECRET:-}" ]]  || die 'В .env не задан AUTH_SECRET'

if [[ "${1:-}" != "--no-pull" ]]; then
  log 'Забираем изменения из git'
  git pull --ff-only
fi

BUILD_VERSION="$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M)"
export BUILD_VERSION
log "Версия сборки: $BUILD_VERSION"

log 'Собираем образ'
docker compose build --build-arg "BUILD_VERSION=$BUILD_VERSION"

log 'Применяем миграции'
# Отдельный одноразовый контейнер: миграции должны пройти до перезапуска,
# иначе новый код встретит старую схему
docker compose run --rm --no-deps --entrypoint '' app \
  node_modules/.bin/prisma migrate deploy

log 'Перезапускаем приложение'
# --wait поднимает новый контейнер и ждёт healthcheck, старый живёт до этого
docker compose up -d --wait --wait-timeout 120

log 'Проверяем /api/health'
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/api/health > /tmp/vin2win-health.json 2>/dev/null; then
    log "Приложение отвечает: $(cat /tmp/vin2win-health.json)"
    rm -f /tmp/vin2win-health.json

    log 'Чистим старые образы'
    docker image prune -f --filter 'until=168h' > /dev/null || true

    log 'Деплой завершён'
    exit 0
  fi
  sleep 3
  [[ $attempt -eq 10 ]] && warn 'Приложение ещё не отвечает, ждём…'
done

warn 'Приложение не ответило на /api/health. Последние логи:'
docker compose logs --tail 60 app
die 'Деплой не подтверждён. Откат: docker compose down && git checkout <прошлый-коммит> && ./deploy/deploy.sh --no-pull'
