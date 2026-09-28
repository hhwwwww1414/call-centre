import { CallStatus, type Prisma } from '@prisma/client';

import { callScopeFilter, type SessionUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { digitsOnly } from '@/lib/phone';
import { resolvePeriod } from '@/lib/time';
import type { CallFilters } from '@/lib/validation';

export const CALL_LIST_SELECT = {
  id: true,
  externalId: true,
  provider: true,
  direction: true,
  status: true,
  outcome: true,
  fromNumber: true,
  toNumber: true,
  startedAt: true,
  answeredAt: true,
  endedAt: true,
  waitSeconds: true,
  durationSeconds: true,
  recordingUrl: true,
  recordingReady: true,
  comment: true,
  tags: true,
  result: true,
  summary: true,
  isImportant: true,
  resultRequired: true,
  resultAt: true,
  contact: { select: { id: true, phoneE164: true, name: true, company: true, isBlocked: true } },
  user: { select: { id: true, name: true, extension: true } },
} satisfies Prisma.CallSelect;

export type CallListItem = Prisma.CallGetPayload<{ select: typeof CALL_LIST_SELECT }>;

/**
 * Where-условие журнала. Изоляция данных прибивается здесь: менеджеру
 * всегда подставляется его userId, что бы ни пришло с клиента (ТЗ 3.2).
 */
export function buildCallWhere(user: SessionUser, filters: CallFilters): Prisma.CallWhereInput {
  const period = resolvePeriod(filters.preset, user.timezone, filters.from, filters.to);

  const where: Prisma.CallWhereInput = {
    ...callScopeFilter(user, filters.userId),
    startedAt: { gte: period.from, lte: period.to },
  };

  if (filters.direction) where.direction = filters.direction;
  if (filters.status) where.status = filters.status;
  if (filters.outcome) where.outcome = filters.outcome;
  if (filters.hasRecording) where.recordingReady = true;
  if (filters.hasComment) where.comment = { not: null };
  if (filters.important) where.isImportant = true;
  if (filters.result === 'NONE') where.result = null;
  else if (filters.result) where.result = filters.result;

  const search = filters.search?.trim();
  if (search) {
    const digits = digitsOnly(search);
    const or: Prisma.CallWhereInput[] = [
      { contact: { name: { contains: search, mode: 'insensitive' } } },
      { contact: { company: { contains: search, mode: 'insensitive' } } },
    ];
    // Ищем по хвосту номера — так находится и «9991234567», и «+7 (999) 123-45-67»
    if (digits.length >= 3) {
      const tail = digits.slice(-10);
      or.push({ fromNumber: { contains: tail } }, { toNumber: { contains: tail } });
    } else {
      or.push({ fromNumber: { contains: search } }, { toNumber: { contains: search } });
    }
    where.OR = or;
  }

  return where;
}

export type CallListResult = {
  items: CallListItem[];
  nextCursor: string | null;
  total: number;
};

/**
 * Курсорная пагинация по (startedAt, id): смена фильтров не ломает выдачу,
 * потому что курсор — это идентификатор записи, а не смещение (ТЗ 5.4).
 */
export async function listCalls(user: SessionUser, filters: CallFilters): Promise<CallListResult> {
  const where = buildCallWhere(user, filters);

  const [items, total] = await Promise.all([
    prisma.call.findMany({
      where,
      select: CALL_LIST_SELECT,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    }),
    prisma.call.count({ where }),
  ]);

  const hasMore = items.length > filters.limit;
  const page = hasMore ? items.slice(0, filters.limit) : items;

  return {
    items: page,
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    total,
  };
}

export async function getCallForUser(user: SessionUser, callId: string) {
  const call = await prisma.call.findFirst({
    where: { id: callId, ...callScopeFilter(user) },
    select: {
      ...CALL_LIST_SELECT,
      rawPayload: false,
      createdAt: true,
      updatedAt: true,
      transcript: {
        select: { status: true, language: true, fullText: true, segments: true, summary: true },
      },
    },
  });

  if (!call) return null;

  // История общения с тем же контактом — в пределах прав текущего пользователя
  const history = call.contact
    ? await prisma.call.findMany({
        where: {
          contactId: call.contact.id,
          id: { not: call.id },
          ...callScopeFilter(user),
        },
        select: {
          id: true,
          direction: true,
          status: true,
          outcome: true,
          startedAt: true,
          durationSeconds: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 20,
      })
    : [];

  return { call, history };
}

const ANSWERED: CallStatus[] = [CallStatus.COMPLETED, CallStatus.IN_PROGRESS];
const MISSED: CallStatus[] = [CallStatus.MISSED, CallStatus.NO_ANSWER];

export type CallKpi = {
  total: number;
  answered: number;
  missed: number;
  avgDurationSeconds: number;
  avgWaitSeconds: number;
  talkTimeSeconds: number;
  missedShare: number;
};

export async function getKpi(where: Prisma.CallWhereInput): Promise<CallKpi> {
  const [total, answered, missed, aggregates] = await Promise.all([
    prisma.call.count({ where }),
    prisma.call.count({ where: { ...where, status: { in: ANSWERED } } }),
    prisma.call.count({ where: { ...where, status: { in: MISSED } } }),
    prisma.call.aggregate({
      where: { ...where, status: CallStatus.COMPLETED },
      _avg: { durationSeconds: true, waitSeconds: true },
      _sum: { durationSeconds: true },
    }),
  ]);

  return {
    total,
    answered,
    missed,
    avgDurationSeconds: Math.round(aggregates._avg.durationSeconds ?? 0),
    avgWaitSeconds: Math.round(aggregates._avg.waitSeconds ?? 0),
    talkTimeSeconds: aggregates._sum.durationSeconds ?? 0,
    missedShare: total > 0 ? Number(((missed / total) * 100).toFixed(1)) : 0,
  };
}

export async function getOutcomeBreakdown(where: Prisma.CallWhereInput) {
  const rows = await prisma.call.groupBy({
    by: ['outcome'],
    where,
    _count: { _all: true },
  });
  return rows.map((row) => ({ outcome: row.outcome, count: row._count._all }));
}

export type SeriesPoint = { bucket: string; inbound: number; outbound: number };

/**
 * Разбивка по часам или дням. Считается в SQL с AT TIME ZONE: JS-агрегация
 * по 30 дням тянула бы все записи в память ради одной гистограммы.
 */
export async function getCallSeries(
  where: Prisma.CallWhereInput,
  timeZone: string,
  granularity: 'hour' | 'day',
): Promise<SeriesPoint[]> {
  const calls = await prisma.call.findMany({
    where,
    select: { startedAt: true, direction: true },
    orderBy: { startedAt: 'asc' },
  });

  const buckets = new Map<string, SeriesPoint>();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(granularity === 'hour' ? { hour: '2-digit' } : {}),
  });

  for (const call of calls) {
    const parts = formatter.formatToParts(call.startedAt);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const key =
      granularity === 'hour'
        ? String(Number(get('hour')) % 24).padStart(2, '0')
        : `${get('year')}-${get('month')}-${get('day')}`;

    const point = buckets.get(key) ?? { bucket: key, inbound: 0, outbound: 0 };
    if (call.direction === 'INBOUND') point.inbound += 1;
    else point.outbound += 1;
    buckets.set(key, point);
  }

  if (granularity === 'hour') {
    // Полные сутки, чтобы график не «прыгал» шириной колонок
    return Array.from({ length: 24 }, (_, hour) => {
      const key = String(hour).padStart(2, '0');
      return buckets.get(key) ?? { bucket: key, inbound: 0, outbound: 0 };
    });
  }

  return Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/** Разрез по менеджерам для админского дашборда (ТЗ 5.3). */
export async function getManagerBreakdown(where: Prisma.CallWhereInput) {
  const [grouped, answered, missed, users] = await Promise.all([
    prisma.call.groupBy({
      by: ['userId'],
      where,
      _count: { _all: true },
      _sum: { durationSeconds: true },
      _avg: { durationSeconds: true, waitSeconds: true },
    }),
    prisma.call.groupBy({
      by: ['userId'],
      where: { ...where, status: { in: ANSWERED } },
      _count: { _all: true },
    }),
    prisma.call.groupBy({
      by: ['userId'],
      where: { ...where, status: { in: MISSED } },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, extension: true, isActive: true },
    }),
  ]);

  const nameById = new Map(users.map((u) => [u.id, u]));
  const answeredById = new Map(answered.map((r) => [r.userId, r._count._all]));
  const missedById = new Map(missed.map((r) => [r.userId, r._count._all]));

  return grouped
    .map((row) => {
      const user = row.userId ? nameById.get(row.userId) : undefined;
      const total = row._count._all;
      const missedCount = missedById.get(row.userId) ?? 0;
      return {
        userId: row.userId,
        name: user?.name ?? null,
        extension: user?.extension ?? null,
        isActive: user?.isActive ?? true,
        total,
        answered: answeredById.get(row.userId) ?? 0,
        missed: missedCount,
        missedShare: total > 0 ? Number(((missedCount / total) * 100).toFixed(1)) : 0,
        avgDurationSeconds: Math.round(row._avg.durationSeconds ?? 0),
        avgWaitSeconds: Math.round(row._avg.waitSeconds ?? 0),
        talkTimeSeconds: row._sum.durationSeconds ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Очередь «нужно перезвонить» — главный рабочий блок менеджера (ТЗ 5.3):
 * пропущенные и те, по кому обещан обратный звонок, старые сверху.
 */
export async function getCallbackQueue(user: SessionUser, limit = 10) {
  return prisma.call.findMany({
    where: {
      ...callScopeFilter(user),
      OR: [{ status: { in: MISSED } }, { outcome: 'CALLBACK' }],
      NOT: { outcome: { in: ['REFUSED', 'SPAM', 'WRONG_NUMBER', 'DEAL'] } },
    },
    select: CALL_LIST_SELECT,
    orderBy: { startedAt: 'asc' },
    take: limit,
  });
}

export async function getRecentCalls(user: SessionUser, limit = 5) {
  return prisma.call.findMany({
    where: callScopeFilter(user),
    select: CALL_LIST_SELECT,
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

/**
 * Звонки, которые менеджер ещё не разметил. Всегда только свои — даже
 * админу окно итога показывает его собственные разговоры.
 */
export async function getPendingResults(user: SessionUser, limit = 20) {
  const where = { userId: user.id, resultRequired: true, result: null };
  const [items, total] = await Promise.all([
    prisma.call.findMany({
      where,
      select: CALL_LIST_SELECT,
      orderBy: { startedAt: 'desc' },
      take: limit,
    }),
    prisma.call.count({ where }),
  ]);
  return { items, total };
}
