-- Realtime (ТЗ 6): триггер на Call шлёт pg_notify в канал call_events.
-- В payload только идентификаторы и статусы — никаких персональных данных
-- (номеров, имён, комментариев) в канале уведомлений.

CREATE OR REPLACE FUNCTION notify_call_event() RETURNS trigger AS $$
DECLARE
  payload text;
BEGIN
  payload := json_build_object(
    'event',     CASE WHEN TG_OP = 'INSERT' THEN 'call.created' ELSE 'call.updated' END,
    'id',        NEW.id,
    'userId',    NEW."userId",
    'status',    NEW.status::text,
    'direction', NEW.direction::text,
    'outcome',   NEW.outcome::text,
    'at',        to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )::text;

  -- Лимит payload у NOTIFY — 8000 байт. Наш payload заведомо меньше,
  -- но подстрахуемся: при переполнении шлём только id.
  IF octet_length(payload) > 7000 THEN
    payload := json_build_object('event', 'call.updated', 'id', NEW.id)::text;
  END IF;

  PERFORM pg_notify('call_events', payload);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS call_notify_insert ON "Call";
CREATE TRIGGER call_notify_insert
  AFTER INSERT ON "Call"
  FOR EACH ROW
  EXECUTE FUNCTION notify_call_event();

DROP TRIGGER IF EXISTS call_notify_update ON "Call";
CREATE TRIGGER call_notify_update
  AFTER UPDATE ON "Call"
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION notify_call_event();
