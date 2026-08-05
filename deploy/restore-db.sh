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

TARGET="${TARGET_DATABASE_URL:-$DATABASE_URL}"

if [[ "$TARGET" == "$DATABASE_URL" ]]; then
  echo 'ВНИМАНИЕ: восстановление в БОЕВУЮ базу. Текущие данные будут заменены.'
  read -r -p 'Введите RESTORE для подтверждения: ' CONFIRM
  [[ "$CONFIRM" == 'RESTORE' ]] || { echo 'Отменено'; exit 1; }
fi

echo "Восстанавливаем $DUMP"

gunzip -c "$DUMP" | docker run --rm -i \
  -e "DATABASE_URL=$TARGET" \
  postgres:18-alpine \
  sh -c 'psql --set ON_ERROR_STOP=on "$DATABASE_URL"'

echo 'Готово. Проверьте приложение: curl -s https://vin2win.online/api/health'
