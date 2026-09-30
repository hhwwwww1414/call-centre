import { CallStatus } from '@prisma/client';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isStorageConfigured, putObject } from '@/lib/storage/s3';

/**
 * Перенос записи от провайдера в наше S3. Провайдер готовит файл не сразу
 * после завершения звонка, поэтому пробуем несколько раз с паузами, а
 * пропущенное добирает периодический проход.
 */
const RETRY_DELAYS_MS = [15_000, 60_000, 5 * 60_000];
const SWEEP_INTERVAL_MS = 5 * 60_000;
const SWEEP_WINDOW_MS = 7 * 86_400_000;
const inFlight = new Set<string>();
const scheduled = new Set<string>();

class NotReadyError extends Error {}

export function recordingKey(callId: string, startedAt: Date): string {
  const day = startedAt.toISOString().slice(0, 10).replaceAll('-', '/');
  return `recordings/${day}/${callId}.mp3`;
}

/** true — запись лежит в S3 (перенесена сейчас или раньше). */
export async function archiveRecording(callId: string): Promise<boolean> {
  if (!isStorageConfigured() || inFlight.has(callId)) return false;
  inFlight.add(callId);
  try {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { id: true, status: true, startedAt: true, recordingUrl: true, recordingKey: true },
    });
    if (!call) return false;
    if (call.recordingKey) return true;
    if (call.status !== CallStatus.COMPLETED || !call.recordingUrl) return false;

    const response = await fetch(call.recordingUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new NotReadyError(`провайдер ответил ${response.status}`);
    const body = new Uint8Array(await response.arrayBuffer());
    // Пустой файл — провайдер ещё не собрал запись
    if (body.byteLength === 0) throw new NotReadyError('файл записи пока пустой');

    const key = recordingKey(call.id, call.startedAt);
    await putObject(key, body, response.headers.get('content-type') || 'audio/mpeg');
    await prisma.call.update({
      where: { id: call.id },
      data: { recordingKey: key, recordingReady: true },
    });
    logger.info({ callId, bytes: body.byteLength }, 'запись перенесена в S3');
    return true;
  } finally {
    inFlight.delete(callId);
  }
}

/** Фоновый перенос сразу после звонка — не задерживает ответ вебхуку. */
export function scheduleArchive(callId: string, attempt = 0): void {
  if (!isStorageConfigured()) return;
  // Вебхук по одному звонку приходит несколько раз — очередь одна
  if (attempt === 0 && scheduled.has(callId)) return;
  const delay = RETRY_DELAYS_MS[attempt];
  if (delay === undefined) {
    scheduled.delete(callId);
    return;
  }
  scheduled.add(callId);
  setTimeout(() => {
    archiveRecording(callId)
      .then(() => scheduled.delete(callId))
      .catch((err) => {
        const last = attempt + 1 >= RETRY_DELAYS_MS.length;
        logger[last ? 'warn' : 'debug']({ err, callId, attempt }, 'перенос записи не удался');
        scheduleArchive(callId, attempt + 1);
      });
  }, delay).unref();
}

/** Добирает записи, которые не перенеслись: рестарт, сбой сети, S3 недоступно. */
export async function sweepRecordings(limit = 20): Promise<void> {
  const calls = await prisma.call.findMany({
    where: {
      status: CallStatus.COMPLETED,
      recordingUrl: { not: null },
      recordingKey: null,
      startedAt: { gte: new Date(Date.now() - SWEEP_WINDOW_MS) },
      // Свежие звонки ещё в руках scheduleArchive
      endedAt: { lte: new Date(Date.now() - 2 * 60_000) },
    },
    orderBy: { startedAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  for (const call of calls) {
    await archiveRecording(call.id).catch((err) =>
      logger.warn({ err, callId: call.id }, 'перенос записи не удался'),
    );
  }
}

let sweeper: NodeJS.Timeout | null = null;

export function startRecordingSweeper(): void {
  if (sweeper || !isStorageConfigured()) return;
  const run = () =>
    sweepRecordings().catch((err) => logger.warn({ err }, 'проход по записям не удался'));
  sweeper = setInterval(run, SWEEP_INTERVAL_MS);
  sweeper.unref();
  setTimeout(run, 30_000).unref();
  logger.info('перенос записей в S3 включён');
}
