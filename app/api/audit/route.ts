import type { Prisma } from '@prisma/client';

import { handleRoute } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { auditFiltersSchema, parseQuery } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleRoute(async () => {
    await requireAdmin();
    const filters = parseQuery(auditFiltersSchema, request.url);

    const where: Prisma.AuditLogWhereInput = {};
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.action) where.action = filters.action;

    const [items, actions, actors] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          meta: true,
          ip: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit + 1,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
      prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } }),
      prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const hasMore = items.length > filters.limit;
    const page = hasMore ? items.slice(0, filters.limit) : items;

    return {
      items: page,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      actions: actions.map((a) => a.action),
      actors,
    };
  });
}
