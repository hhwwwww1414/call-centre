import { CallDirection, CallStatus, type Call } from '@prisma/client';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { toE164 } from '@/lib/phone';
import type { NormalizedCallEvent } from '@/lib/telephony/types';

/**
 * Единственная точка записи звонка в БД. Сюда сходятся и mock, и вебхук
 * Exolve — поэтому идемпотентность и привязка к менеджеру описаны один раз.
 */
export async function ingestCallEvent(
  event: NormalizedCallEvent,
  provider: string,
): Promise<Call> {
  const fromNumber = toE164(event.fromNumber) || event.fromNumber;
  const toNumber = toE164(event.toNumber) || event.toNumber;

  // Контакт — это всегда «внешняя» сторона разговора
  const contactPhone = event.direction === CallDirection.INBOUND ? fromNumber : toNumber;
  const contact = await resolveContact(contactPhone);
  const userId = await resolveManager(event);

  const durationSeconds = event.durationSeconds ?? computeDuration(event);
  const waitSeconds = event.waitSeconds ?? computeWait(event);

  const data = {
    provider,
    direction: event.direction as CallDirection,
    status: event.status,
    fromNumber,
    toNumber,
    contactId: contact?.id ?? null,
    userId,
    startedAt: event.startedAt,
    answeredAt: event.answeredAt ?? null,
    endedAt: event.endedAt ?? null,
    waitSeconds,
    durationSeconds,
    recordingUrl: event.recordingUrl ?? null,
    recordingReady: Boolean(event.recordingUrl),
    rawPayload: safeRaw(event.raw),
  };

  // externalId — ключ идемпотентности: повторный вебхук обновляет, не дублирует
  const call = await prisma.call.upsert({
    where: { externalId: event.externalId },
    create: { externalId: event.externalId, ...data },
    update: {
      status: data.status,
      answeredAt: data.answeredAt,
      endedAt: data.endedAt,
      waitSeconds: data.waitSeconds,
      durationSeconds: data.durationSeconds,
      // Уже сохранённую запись не затираем пустой
      ...(data.recordingUrl ? { recordingUrl: data.recordingUrl, recordingReady: true } : {}),
      // Менеджер мог определиться только на втором событии
      ...(userId ? { userId } : {}),
      contactId: data.contactId,
      rawPayload: data.rawPayload,
    },
  });

  logger.debug(
    { callId: call.id, externalId: event.externalId, type: event.type, status: call.status },
    'call event ingested',
  );

  return call;
}

/** Контакт находится по номеру или создаётся автоматически (ТЗ 4). */
async function resolveContact(phoneE164: string) {
  if (!phoneE164) return null;
  try {
    return await prisma.contact.upsert({
      where: { phoneE164 },
      create: { phoneE164 },
      update: {},
    });
  } catch (err) {
    logger.warn({ err, phoneE164 }, 'contact resolve failed');
    return null;
  }
}

/**
 * Сопоставление с менеджером: сначала явный userId, затем добавочный номер.
 * Не нашли — звонок остаётся нераспределённым и виден админу (ТЗ 7.3).
 */
async function resolveManager(event: NormalizedCallEvent): Promise<string | null> {
  if (event.userId) return event.userId;

  const extension = event.extension?.trim();
  if (!extension) return null;

  const user = await prisma.user.findFirst({
    where: { extension, isActive: true, deletedAt: null },
    select: { id: true },
  });

  return user?.id ?? null;
}

function computeDuration(event: NormalizedCallEvent): number {
  if (!event.answeredAt || !event.endedAt) return 0;
  return Math.max(0, Math.round((event.endedAt.getTime() - event.answeredAt.getTime()) / 1000));
}

function computeWait(event: NormalizedCallEvent): number | null {
  const end = event.answeredAt ?? event.endedAt;
  if (!end) return null;
  return Math.max(0, Math.round((end.getTime() - event.startedAt.getTime()) / 1000));
}

/** Сырой payload в лог отладки — но не больше 16 КБ, чтобы не раздувать БД. */
function safeRaw(raw: unknown) {
  try {
    const text = JSON.stringify(raw);
    if (!text) return undefined;
    if (text.length > 16_000) return { truncated: true, preview: text.slice(0, 2000) } as never;
    return JSON.parse(text) as never;
  } catch {
    return undefined;
  }
}

/** Терминальные статусы — звонок больше не изменится сам. */
export const TERMINAL_STATUSES: CallStatus[] = [
  CallStatus.COMPLETED,
  CallStatus.MISSED,
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.FAILED,
  CallStatus.CANCELED,
];

export function isTerminal(status: CallStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
