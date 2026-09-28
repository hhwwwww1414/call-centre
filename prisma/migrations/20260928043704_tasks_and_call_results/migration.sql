-- CreateEnum
CREATE TYPE "CallResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TaskMetric" AS ENUM ('CALLS', 'ANSWERED', 'SUCCESSFUL');

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "isImportant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "result" "CallResult",
ADD COLUMN     "resultAt" TIMESTAMP(3),
ADD COLUMN     "resultById" TEXT,
ADD COLUMN     "resultRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metric" "TaskMetric" NOT NULL DEFAULT 'CALLS',
    "target" INTEGER NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "Task_batchId_idx" ON "Task"("batchId");

-- CreateIndex
CREATE INDEX "Task_status_createdAt_idx" ON "Task"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Call_userId_resultRequired_result_idx" ON "Call"("userId", "resultRequired", "result");

-- CreateIndex
CREATE INDEX "Call_isImportant_startedAt_idx" ON "Call"("isImportant", "startedAt");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_resultById_fkey" FOREIGN KEY ("resultById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Realtime для задач: тот же канал, что и у звонков. Менеджер видит новую
-- задачу сразу, без перезагрузки. В payload — только идентификаторы.
CREATE OR REPLACE FUNCTION notify_task_event() RETURNS trigger AS $$
DECLARE
  rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := OLD;
  ELSE
    rec := NEW;
  END IF;

  PERFORM pg_notify('call_events', json_build_object(
    'event',  CASE TG_OP WHEN 'INSERT' THEN 'task.created' WHEN 'DELETE' THEN 'task.deleted' ELSE 'task.updated' END,
    'id',     rec.id,
    'userId', rec."assigneeId",
    'status', rec.status::text,
    'at',     to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_notify ON "Task";
CREATE TRIGGER task_notify
  AFTER INSERT OR UPDATE OR DELETE ON "Task"
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_event();
