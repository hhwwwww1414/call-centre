ALTER TYPE "CallOutcome" ADD VALUE 'VOICEMAIL';
ALTER TYPE "CallOutcome" ADD VALUE 'HUNG_UP';

-- Итог теперь спрашиваем только там, где был ответ. Недозвонам, которые ещё
-- висят в очереди окна итога, ставим «Неуспешный» — как делает приём звонка.
UPDATE "Call"
SET "result" = 'FAILURE', "resultRequired" = false
WHERE "resultRequired" AND "result" IS NULL AND "status" <> 'COMPLETED';

-- Выполненные задачи не сбрасываем: при чтении прогресс пересчитается по
-- новым правилам, и только те, что им больше не соответствуют, вернутся в
-- активные. Остальные сохранят исходное время выполнения.
