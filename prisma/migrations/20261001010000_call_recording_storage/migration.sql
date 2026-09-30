ALTER TABLE "Call" ADD COLUMN "recordingKey" TEXT;

-- Провайдер присылает ссылку и на недозвоны, но файл там пустой. Слушать
-- можно только звонки с ответом
UPDATE "Call" SET "recordingReady" = false WHERE "status" <> 'COMPLETED';
