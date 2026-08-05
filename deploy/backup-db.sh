#!/usr/bin/env bash
# Ежедневный дамп БД (ТЗ 8.5). Хранение — 14 дней.
# Ставится в cron пользователя deploy:
#   15 3 * * * /opt/vin2win-crm/deploy/backup-db.sh >> /var/log/vin2win-backup.log 2>&1
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vin2win-crm}"
KEEP_DAYS="${KEEP_DAYS:-14}"

cd "$APP_DIR"

[[ -f .env ]] || { echo "Нет .env в $APP_DIR" >&2; exit 1; }

set -a
# shellcheck disable=SC1091
source .env
set +a

[[ -n "${DATABASE_URL:-}" ]] || { echo 'В .env не задан DATABASE_URL' >&2; exit 1; }

# В DATABASE_URL живут параметры Prisma (schema, connection_limit), которых
# libpq не знает: pg_dump на них падает с "invalid URI query parameter".
# Вырезаем их, остальное — sslmode и прочее — оставляем как есть.
strip_prisma_params() {
  local url="$1"
  for param in schema connection_limit pool_timeout connect_timeout socket_timeout pgbouncer; do
    url="$(printf '%s' "$url" | sed -E "s/([?&])${param}=[^&]*(&|$)/\1/g")"
  done
  # Подчищаем осиротевшие разделители после вырезания
  url="$(printf '%s' "$url" | sed -E 's/[?&]+$//; s/\?&/?/; s/&&+/\&/g')"
  printf '%s' "$url"
}

DUMP_URL="$(strip_prisma_params "$DATABASE_URL")"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/vin2win-crm-$STAMP.sql.gz"

echo "[$(date --iso-8601=seconds)] Дамп → $FILE"

# pg_dump берём из образа postgres — на VPS не нужен установленный клиент.
# Пароль передаём через переменную окружения, а не аргументом: аргументы
# видны в списке процессов
docker run --rm \
  -e "PGCONNECT_TIMEOUT=15" \
  -e "DUMP_URL=$DUMP_URL" \
  postgres:18-alpine \
  sh -c 'pg_dump --no-owner --no-privileges --format=plain "$DUMP_URL"' \
  | gzip -9 > "$FILE"

chmod 600 "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"

# Пустой дамп — это провал бэкапа, а не успех. Битый файл удаляем сразу:
# иначе он останется лежать и будет выглядеть как рабочая точка отката
if [[ "$(stat -c%s "$FILE")" -lt 1024 ]]; then
  echo "ОШИБКА: дамп подозрительно мал ($SIZE), удаляю $FILE" >&2
  rm -f "$FILE"
  exit 1
fi

echo "Готово: $SIZE"

echo "Удаляем дампы старше $KEEP_DAYS дней"
find "$BACKUP_DIR" -name 'vin2win-crm-*.sql.gz' -type f -mtime "+$KEEP_DAYS" -print -delete

echo "Текущие бэкапы:"
ls -1sh "$BACKUP_DIR" | tail -n 20
