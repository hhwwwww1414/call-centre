import { handleRoute } from '@/lib/api';
import { canSeeAllCalls, callScopeFilter, requireUser } from '@/lib/auth/rbac';
import {
  getCallbackQueue,
  getCallSeries,
  getKpi,
  getManagerBreakdown,
  getOutcomeBreakdown,
  getRecentCalls,
} from '@/lib/services/calls';
import { resolvePeriod } from '@/lib/time';
import { parseQuery, statsQuerySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const query = parseQuery(statsQuerySchema, request.url);
    const period = resolvePeriod(query.preset, user.timezone, query.from, query.to);

    const where = {
      ...callScopeFilter(user, query.userId),
      startedAt: { gte: period.from, lte: period.to },
    };

    const [kpi, series, outcomes, recent, callbackQueue, managers] = await Promise.all([
      getKpi(where),
      getCallSeries(where, user.timezone, period.granularity),
      getOutcomeBreakdown(where),
      getRecentCalls(user, 5),
      getCallbackQueue(user, 8),
      canSeeAllCalls(user.role) ? getManagerBreakdown(where) : Promise.resolve([]),
    ]);

    return {
      period: {
        preset: period.preset,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        granularity: period.granularity,
      },
      kpi,
      series,
      outcomes,
      recent,
      callbackQueue,
      managers,
    };
  });
}
