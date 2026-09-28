import { handleRoute, notFound } from '@/lib/api';
import { callScopeFilter, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import {
  assertContactAccess,
  contactAuditWhere,
  contactHistorySchema,
} from '@/lib/services/contacts';
import { parseQuery } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertContactAccess(user, id);
    const { cursor } = parseQuery(contactHistorySchema, request.url);
    const calls = await prisma.call.findMany({
      where: { contactId: id, ...callScopeFilter(user) },
      select: { id: true },
    });
    const where = contactAuditWhere(
      id,
      calls.map((call) => call.id),
    );
    if (
      cursor &&
      !(await prisma.auditLog.findFirst({ where: { ...where, id: cursor }, select: { id: true } }))
    ) {
      throw notFound('Событие не найдено в истории клиента');
    }
    const rows = await prisma.auditLog.findMany({
      where,
      // No IP, user agent, email, or unrelated system events in the client workspace.
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        meta: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, 50);
    return { items, nextCursor: rows.length > 50 ? items.at(-1)!.id : null };
  });
}
