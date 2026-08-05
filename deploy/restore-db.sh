#!/usr/bin/env bash
# Восстановление БД из дампа. Проверять хотя бы раз — обязательное
# требование ТЗ 8.5: непроверенный бэкап бэкапом не считается.
#
#   ./deploy/restore-db.sh /var/backups/vin2win-crm/vin2win-crm-20260805-031500.sql.gz
#   TARGET_DATABASE_URL=postgresql://... ./deploy/restore-db.sh <файл>   # в тестовую БД
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP="${1:-}"

[[ -n "$DUMP" ]] || { echo 'Укажите файл дампа' >&2; exit 1; }
[[ -f "$DUMP" ]] || { echo "Файл не найден: $DUMP" >&2; exit 1; }

cd "$APP_DIR"
set -a
# shellcheck disable=SC1091
source .env
set +a

# Как и в backup-db.sh: libpq не понимает параметры Prisma в URI
strip_prisma_params() {
  local url="$1"
  for param in schema connection_limit pool_timeout connect_timeout socket_timeout pgbouncer; do
    url="$(printf '%s' "$url" | sed -E "s/([?&])${param}=[^&]*(&|$)/\1/g")"
  done
  url="$(printf '%s' "$url" | sed -E 's/[?&]+$//; s/\?&/?/; s/&&+/\&/g')"
  printf '%s' "$url"
}

TARGET_RAW="${TARGET_DATABASE_URL:-$DATABASE_URL}"

# Сравниваем ДО очистки: после неё строка перестала бы совпадать с боевой,
# и подтверждение молча перестало бы спрашиваться
if [[ "$TARGET_RAW" == "$DATABASE_URL" ]]; then
  echo 'ВНИМАНИЕ: восстановление в БОЕВУЮ базу. Текущие данные будут заменены.'
  read -r -p 'Введите RESTORE для подтверждения: ' CONFIRM
  [[ "$CONFIRM" == 'RESTORE' ]] || { echo 'Отменено'; exit 1; }
fi

TARGET="$(strip_prisma_params "$TARGET_RAW")"

echo "Восстанавливаем $DUMP"

gunzip -c "$DUMP" | docker run --rm -i \
  -e "DATABASE_URL=$TARGET" \
  postgres:18-alpine \
  sh -c 'psql --set ON_ERROR_STOP=on "$DATABASE_URL"'

echo 'Готово. Проверьте приложение: curl -s https://vin2win.online/api/health'
