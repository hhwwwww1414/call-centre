import { CallDirection, CallStatus, type Call } from '@prisma/client';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { toE164 } from '@/lib/phone';
import { syncTaskCompletion } from '@/lib/services/tasks';
import type { NormalizedCallEvent } from '@/lib/telephony/types';

/**
 * Единственная точка записи звонка в БД. Сюда сходятся и mock, и вебхуки
 * провайдеров — поэтому идемпотентность и привязка к менеджеру описаны один раз.
 */
export async function ingestCallEvent(event: NormalizedCallEvent, provider: string): Promise<Call> {
  const fromNumber = toE164(event.fromNumber) || event.fromNumber;
  const toNumber = toE164(event.toNumber) || event.toNumber;

  // Контакт — это всегда «внешняя» сторона разговора
  const contactPhone = event.direction === CallDirection.INBOUND ? fromNumber : toNumber;
  const contact = await resolveContact(contactPhone);
  const userId = await resolveManager(event, toNumber);

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

  const existing = await prisma.call.findUnique({
    where: { externalId: event.externalId },
    select: { status: true, userId: true },
  });

  // Менеджер размечает итог: любой завершённый исходящий и принятый входящий.
  // Пропущенный входящий размечать нечего — разговора не было. Менеджер мог
  // определиться на раннем событии, а финальное пришло уже без добавочного
  const needsResult =
    Boolean(userId ?? existing?.userId) &&
    isTerminal(event.status) &&
    (event.direction === CallDirection.OUTBOUND || event.status === CallStatus.COMPLETED);

  // Провайдеры не гарантируют порядок доставки, а АТС шлёт события по каждому
  // плечу звонка. Запоздавший «дозвон» или «не ответил» от второго сотрудника
  // не должны откатить уже состоявшийся разговор
  const staleEvent = existing !== null && !canTransition(existing.status, event.status);
  // externalId — ключ идемпотентности: повторный вебхук обновляет, не дублирует
  const call = await prisma.call.upsert({
    where: { externalId: event.externalId },
    create: { externalId: event.externalId, ...data, resultRequired: needsResult },
    update: staleEvent
      ? {}
      : {
          status: data.status,
          // Промежуточное событие без времени ответа не стирает уже известное
          ...(event.answeredAt ? { answeredAt: data.answeredAt } : {}),
          ...(event.endedAt ? { endedAt: data.endedAt } : {}),
          ...(waitSeconds !== null ? { waitSeconds } : {}),
          ...(durationSeconds > 0 || isTerminal(event.status) ? { durationSeconds } : {}),
          // Уже сохранённую запись не затираем пустой
          ...(data.recordingUrl ? { recordingUrl: data.recordingUrl, recordingReady: true } : {}),
          // Менеджер мог определиться только на втором событии
          ...(userId ? { userId } : {}),
          ...(needsResult ? { resultRequired: true } : {}),
          contactId: data.contactId,
          rawPayload: data.rawPayload,
        },
  });

  await claimContact(call);

  // Исходящий завершился — счётчики задач менеджера могли сдвинуться
  if (isTerminal(call.status) && call.direction === CallDirection.OUTBOUND) {
    await syncTaskCompletion(call.userId);
  }

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
async function resolveManager(
  event: NormalizedCallEvent,
  toNumberE164: string,
): Promise<string | null> {
  if (event.userId) return event.userId;

  const extension = event.extension?.trim();
  if (extension) {
    const user = await prisma.user.findFirst({
      where: { extension, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (user) return user.id;
  }

  // Звонок на личный номер менеджера — его звонок, даже пока АТС
  // не сообщила, на какой добавочный он ушёл
  if (event.direction === CallDirection.INBOUND && toNumberE164) {
    const owner = await prisma.user.findFirst({
      where: { personalNumber: toNumberE164, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (owner) return owner.id;
  }

  return null;
}

/**
 * Первый состоявшийся разговор закрепляет контакт за менеджером — так
 * распределение с общего номера работает с первого дня, без ручной разметки.
 * Уже назначенного ответственного не трогаем.
 */
async function claimContact(call: Call): Promise<void> {
  if (call.status !== CallStatus.COMPLETED || !call.userId || !call.contactId) return;
  try {
    await prisma.contact.updateMany({
      where: { id: call.contactId, ownerId: null },
      data: { ownerId: call.userId },
    });
  } catch (err) {
    logger.warn({ err, callId: call.id }, 'contact owner assign failed');
  }
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

/**
 * Можно ли перевести звонок из текущего статуса в пришедший.
 * Состоявшийся разговор — финал: его дополняет только повтор «завершён»
 * (например, со ссылкой на запись). Неуспешный финал ещё может смениться
 * ответом — при дозвоне на группу первым приходит отказ соседнего плеча.
 */
export function canTransition(current: CallStatus, next: CallStatus): boolean {
  if (current === CallStatus.COMPLETED) return next === CallStatus.COMPLETED;
  if (isTerminal(current)) return next !== CallStatus.RINGING;
  return true;
}
