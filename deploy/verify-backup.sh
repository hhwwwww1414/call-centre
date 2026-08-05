#!/usr/bin/env bash
# Проверка восстановимости дампа (ТЗ 8.5): непроверенный бэкап бэкапом
# не считается. Поднимает временный PostgreSQL в контейнере, разворачивает
# в него дамп и сверяет, что данные на месте. Боевую БД не трогает.
#
#   ./deploy/verify-backup.sh                       # последний дамп
#   ./deploy/verify-backup.sh /path/to/dump.sql.gz  # конкретный
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/vin2win-crm}"
DUMP="${1:-$(ls -1t "$BACKUP_DIR"/vin2win-crm-*.sql.gz 2>/dev/null | head -1)}"

[[ -n "$DUMP" && -f "$DUMP" ]] || { echo "Дамп не найден: ${DUMP:-<нет файлов>}" >&2; exit 1; }

CONTAINER="vin2win-restore-check-$$"
PGPASS="verify-$(date +%s)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Проверяем $DUMP ($(du -h "$DUMP" | cut -f1))"

docker run -d --name "$CONTAINER" \
  -e "POSTGRES_PASSWORD=$PGPASS" \
  -e POSTGRES_DB=restore_check \
  postgres:18-alpine >/dev/null

# pg_isready недостаточно: во время initdb поднимается временный сервер,
# который отвечает «готов», а затем выключается. Ждём реального запроса.
echo -n 'Ждём готовности временной БД'
READY=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -d restore_check -c 'SELECT 1' >/dev/null 2>&1; then
    READY=1
    echo ' — готова'
    break
  fi
  echo -n '.'
  sleep 1
done

if [[ "$READY" -ne 1 ]]; then
  echo ''
  echo 'ОШИБКА: временная БД не поднялась' >&2
  docker logs "$CONTAINER" 2>&1 | tail -20 >&2
  exit 1
fi

echo 'Разворачиваем дамп'
gunzip -c "$DUMP" | docker exec -i "$CONTAINER" \
  psql -U postgres -d restore_check --set ON_ERROR_STOP=on -q

echo 'Сверяем содержимое'
docker exec "$CONTAINER" psql -U postgres -d restore_check -t -A -F' | ' -c "
  SELECT 'Пользователи', count(*) FROM \"User\"
  UNION ALL SELECT 'Звонки', count(*) FROM \"Call\"
  UNION ALL SELECT 'Контакты', count(*) FROM \"Contact\"
  UNION ALL SELECT 'Аудит', count(*) FROM \"AuditLog\";
"

USERS="$(docker exec "$CONTAINER" psql -U postgres -d restore_check -t -A -c 'SELECT count(*) FROM "User"')"
if [[ "$USERS" -lt 1 ]]; then
  echo 'ОШИБКА: в восстановленной базе нет ни одного пользователя' >&2
  exit 1
fi

echo 'Восстановление проверено: дамп разворачивается, данные на месте.'
