import { badRequest, handleRoute, notFound } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { AuthError, callScopeFilter, canSeeAllCalls, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { CALL_LIST_SELECT } from '@/lib/services/calls';
import { marketplaceAdminUrl, marketplaceProfileUrl } from '@/lib/services/marketplace';
import { contactUpdateSchema, parseQuery } from '@/lib/validation';
import {
  assertContactAccess,
  CONTACT_SELECT,
  contactCallsWhere,
  contactHistorySchema,
} from '@/lib/services/contacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const contact = await assertContactAccess(user, id);
    const filters = parseQuery(contactHistorySchema, request.url);
    const where = contactCallsWhere(user, id, filters);
    if (
      filters.cursor &&
      !(await prisma.call.findFirst({
        where: { ...where, id: filters.cursor },
        select: { id: true },
      }))
    ) {
      throw notFound('Звонок не найден в истории клиента');
    }
    const scope = { contactId: id, ...callScopeFilter(user) };
    const [rows, total, aggregate, recordings, comments, tagged] = await Promise.all([
      prisma.call.findMany({
        where,
        select: CALL_LIST_SELECT,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 51,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
      prisma.call.count({ where }),
      prisma.call.aggregate({
        where: scope,
        _count: true,
        _sum: { durationSeconds: true },
        _max: { startedAt: true },
      }),
      prisma.call.count({ where: { ...scope, recordingReady: true, recordingUrl: { not: null } } }),
      prisma.call.count({
        where: { ...scope, OR: [{ comment: { not: null } }, { summary: { not: null } }] },
      }),
      prisma.call.findMany({
        where: { ...scope, tags: { isEmpty: false } },
        select: { tags: true },
      }),
    ]);
    const calls = rows.slice(0, 50);
    const account = contact.marketplace;
    return {
      contact,
      marketplaceLinks: account
        ? {
            profile: marketplaceProfileUrl(account.id),
            admin: canSeeAllCalls(user.role) ? marketplaceAdminUrl(account.id) : null,
          }
        : null,
      calls,
      total,
      nextCursor: rows.length > 50 ? calls.at(-1)!.id : null,
      summary: {
        calls: aggregate._count,
        durationSeconds: aggregate._sum.durationSeconds ?? 0,
        lastCallAt: aggregate._max.startedAt,
        recordings,
        comments,
        taggedCalls: tagged.length,
        tags: [...new Set(tagged.flatMap((call) => call.tags))].sort(),
      },
    };
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const before = await assertContactAccess(user, id);
    const input = contactUpdateSchema.parse(await request.json());

    // Ответственного назначает админ или супервайзер. Менеджер может только
    // взять себе свободного клиента — чужого не перехватить
    if (input.ownerId !== undefined && input.ownerId !== before.ownerId) {
      const manages = canSeeAllCalls(user.role);
      const selfClaim = input.ownerId === user.id && before.ownerId === null;
      if (!manages && !selfClaim) {
        throw new AuthError('Ответственного назначает администратор', 403);
      }
      if (input.ownerId) {
        const owner = await prisma.user.findFirst({
          where: { id: input.ownerId, isActive: true, deletedAt: null },
          select: { id: true },
        });
        if (!owner) throw badRequest('Менеджер не найден или ему закрыт доступ');
      }
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name?.trim() || null } : {}),
        ...(input.company !== undefined ? { company: input.company?.trim() || null } : {}),
        ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
        ...(input.isBlocked !== undefined ? { isBlocked: input.isBlocked } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId ?? null } : {}),
      },
      select: CONTACT_SELECT,
    });

    if (input.isBlocked !== undefined && input.isBlocked !== before.isBlocked) {
      await writeAudit({
        actorId: user.id,
        action: input.isBlocked ? 'contact.block' : 'contact.unblock',
        entityType: 'Contact',
        entityId: id,
        meta: { phone: contact.phoneE164 },
      });
    }
    if (input.ownerId !== undefined && input.ownerId !== before.ownerId) {
      await writeAudit({
        actorId: user.id,
        action: 'contact.owner.update',
        entityType: 'Contact',
        entityId: id,
        meta: { from: before.owner?.name ?? null, to: contact.owner?.name ?? null },
      });
    }
    const changes: Record<string, { from: string | null; to: string | null }> = {};
    for (const field of ['name', 'company', 'note'] as const) {
      if (before[field] !== contact[field])
        changes[field] = { from: before[field], to: contact[field] };
    }
    if (Object.keys(changes).length > 0) {
      await writeAudit({
        actorId: user.id,
        action: 'contact.update',
        entityType: 'Contact',
        entityId: id,
        meta: { changes },
      });
    }

    return contact;
  });
}
