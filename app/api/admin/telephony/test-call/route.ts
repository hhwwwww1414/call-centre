import type { CallDirection } from '@prisma/client';

import { badRequest, handleRoute } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { ru } from '@/lib/i18n/ru';
import { getProviderName, MockTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «Сгенерировать тестовый звонок» (ТЗ 5.8) — демонстрация realtime.
 * Звонок разыгрывается во времени: дозвон → разговор → завершение.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();

    if (getProviderName() !== 'mock') {
      throw badRequest(ru.telephony.testCallOnlyMock);
    }

    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      direction?: CallDirection;
    };

    // Кому приписать звонок: явно выбранному менеджеру или случайному активному
    let userId = body.userId ?? null;
    let extension: string | null = null;

    if (userId) {
      const target = await prisma.user.findFirst({
        where: { id: userId, isActive: true, deletedAt: null },
        select: { id: true, extension: true },
      });
      if (!target) throw badRequest('Менеджер не найден или ему закрыт доступ');
      extension = target.extension;
    } else {
      const candidates = await prisma.user.findMany({
        where: { isActive: true, deletedAt: null, role: { in: ['MANAGER', 'ADMIN'] } },
        select: { id: true, extension: true },
        orderBy: { createdAt: 'asc' },
      });
      const picked = candidates[Math.floor(Math.random() * Math.max(1, candidates.length))];
      userId = picked?.id ?? admin.id;
      extension = picked?.extension ?? null;
    }

    const provider = new MockTelephonyProvider();
    const result = await provider.playScenario({
      userId,
      extension,
      ...(body.direction ? { direction: body.direction } : {}),
    });

    await writeAudit({
      actorId: admin.id,
      action: 'call.test.generate',
      entityType: 'Call',
      meta: { externalId: result.externalId, userId },
    });

    return { ok: true, externalId: result.externalId, userId };
  });
}
