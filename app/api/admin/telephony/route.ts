import { handleRoute } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/rbac';
import { appUrl } from '@/lib/config';
import { prisma } from '@/lib/db';
import { getProviderName, getTelephonyProvider, webhookUrl } from '@/lib/telephony';
import { ExolveTelephonyProvider } from '@/lib/telephony/providers/exolve';
import { SipuniTelephonyProvider } from '@/lib/telephony/providers/sipuni';

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
    // Ключи показываем для активного провайдера; в демо-режиме — для Sipuni,
    // потому что переходить будем на него
    const credentials =
      name === 'exolve'
        ? new ExolveTelephonyProvider().configState()
        : new SipuniTelephonyProvider().configState();

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
      // Сам токен не отдаём даже админу — только место, куда его подставить
      webhookUrl:
        name === 'sipuni'
          ? `${webhookUrl(appUrl(), name)}?token=<SIPUNI_WEBHOOK_TOKEN>`
          : webhookUrl(appUrl(), name),
      // Адрес для функции «HTTP-запрос» в схеме общего номера
      routingUrl: `${appUrl()}/api/webhooks/sipuni-routing?token=<SIPUNI_WEBHOOK_TOKEN>`,
      credentials,
      lastCall,
      callsLast24h: callsToday,
    };
  });
}
