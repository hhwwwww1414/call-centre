import { CallStatus, Prisma } from '@prisma/client';

import { handleRoute } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { getManagerBreakdown, getOutcomeBreakdown } from '@/lib/services/calls';
import { resolvePeriod } from '@/lib/time';
import { parseQuery, statsQuerySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HourRow = { hour: number; total: bigint; missed: bigint };
type WeekdayRow = { weekday: number; total: bigint };

/** Расширенная аналитика (ТЗ 5.7). Агрегации считает Postgres. */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const query = parseQuery(statsQuerySchema, request.url);
    const period = resolvePeriod(query.preset, user.timezone, query.from, query.to);

    const where: Prisma.CallWhereInput = {
      startedAt: { gte: period.from, lte: period.to },
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const userFilter = query.userId ? Prisma.sql`AND "userId" = ${query.userId}` : Prisma.empty;
    const missedStatuses = Prisma.join([CallStatus.MISSED, CallStatus.NO_ANSWER]);

    const [managers, outcomes, byHour, byWeekday] = await Promise.all([
      getManagerBreakdown(where),
      getOutcomeBreakdown(where),
      prisma.$queryRaw<HourRow[]>`
        SELECT
          EXTRACT(HOUR FROM "startedAt" AT TIME ZONE ${user.timezone})::int AS hour,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "status"::text IN (${missedStatuses})) AS missed
        FROM "Call"
        WHERE "startedAt" >= ${period.from} AND "startedAt" <= ${period.to}
        ${userFilter}
        GROUP BY 1
        ORDER BY 1
      `,
      prisma.$queryRaw<WeekdayRow[]>`
        SELECT
          EXTRACT(DOW FROM "startedAt" AT TIME ZONE ${user.timezone})::int AS weekday,
          COUNT(*) AS total
        FROM "Call"
        WHERE "startedAt" >= ${period.from} AND "startedAt" <= ${period.to}
        ${userFilter}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const hourMap = new Map(byHour.map((row) => [row.hour, row]));
    const hours = Array.from({ length: 24 }, (_, hour) => {
      const row = hourMap.get(hour);
      const total = Number(row?.total ?? 0);
      const missed = Number(row?.missed ?? 0);
      return {
        hour,
        total,
        missed,
        missedShare: total > 0 ? Number(((missed / total) * 100).toFixed(1)) : 0,
      };
    });

    const weekdayMap = new Map(byWeekday.map((row) => [row.weekday, Number(row.total)]));
    const weekdays = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      total: weekdayMap.get(weekday) ?? 0,
    }));

    return {
      period: {
        preset: period.preset,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
      },
      managers,
      outcomes,
      hours,
      weekdays,
    };
  });
}
