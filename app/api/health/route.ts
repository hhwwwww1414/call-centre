import { NextResponse } from 'next/server';

import { buildVersion } from '@/lib/config';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { callEventBus } from '@/lib/realtime/bus';
import { getProviderName } from '@/lib/telephony';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** HEALTHCHECK контейнера и точка мониторинга (ТЗ 8.4, 8.5). */
export async function GET() {
  const startedAt = Date.now();
  let database = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch (err) {
    logger.error({ err }, 'health: база недоступна');
  }

  const body = {
    status: database ? 'ok' : 'degraded',
    version: buildVersion(),
    database,
    realtime: callEventBus.isConnected,
    realtimeClients: callEventBus.subscriberCount,
    telephony: getProviderName(),
    uptimeSeconds: Math.round(process.uptime()),
    latencyMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: database ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
