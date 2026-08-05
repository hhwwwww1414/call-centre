import { handleRoute } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/rbac';
import { appUrl } from '@/lib/config';
import { prisma } from '@/lib/db';
import { getProviderName, getTelephonyProvider, webhookUrl } from '@/lib/telephony';
import { ExolveTelephonyProvider } from '@/lib/telephony/providers/exolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Состояние телефонии для /admin/telephony.
 * Значения ключей наружу не отдаются — только «задано / не задано» (ТЗ 5.8).
 */
export async function GET() {
  return handleRoute(async () => {
    await requireAdmin();

    const name = getProviderName();
    const provider = getTelephonyProvider(name);
    const exolve = new ExolveTelephonyProvider();

    const [lastCall, callsToday] = await Promise.all([
      prisma.call.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true, provider: true, status: true },
      }),
      prisma.call.count({ where: { startedAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    ]);

    return {
      provider: name,
      configured: provider.isConfigured(),
      webhookUrl: webhookUrl(appUrl(), name),
      credentials: exolve.configState(),
      lastCall,
      callsLast24h: callsToday,
    };
  });
}
