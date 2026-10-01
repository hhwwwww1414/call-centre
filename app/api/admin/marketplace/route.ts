import { handleRoute, serviceUnavailable } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import {
  getSyncStatus,
  isMarketplaceConfigured,
  syncMarketplace,
} from '@/lib/services/marketplace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function overview() {
  const [status, accounts, unassigned] = await Promise.all([
    getSyncStatus(),
    prisma.marketplaceAccount.count({ where: { removedAt: null } }),
    prisma.marketplaceAccount.count({
      where: { removedAt: null, contact: { ownerId: null } },
    }),
  ]);
  return { configured: isMarketplaceConfigured(), status, accounts, unassigned };
}

/** Состояние синхронизации с vin2win. */
export async function GET() {
  return handleRoute(async () => {
    await requireAdmin();
    return overview();
  });
}

/** Синхронизировать сейчас, не дожидаясь планового прохода. */
export async function POST() {
  return handleRoute(async () => {
    const user = await requireAdmin();
    if (!isMarketplaceConfigured()) throw serviceUnavailable('Подключение к vin2win не настроено');
    const status = await syncMarketplace();
    await writeAudit({
      actorId: user.id,
      action: 'settings.update',
      entityType: 'Setting',
      entityId: 'marketplace.sync',
      meta: { ok: status.ok, accounts: status.accounts ?? null },
    });
    return overview();
  });
}
