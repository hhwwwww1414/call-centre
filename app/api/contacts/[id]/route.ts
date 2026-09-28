import { badRequest, handleRoute, notFound } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { AuthError, callScopeFilter, canSeeAllCalls, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { CALL_LIST_SELECT } from '@/lib/services/calls';
import { contactUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const CONTACT_SELECT = {
  id: true,
  name: true,
  company: true,
  note: true,
  isBlocked: true,
  phoneE164: true,
  ownerId: true,
  owner: { select: { id: true, name: true, extension: true } },
} as const;

/** Менеджер работает с контактом, если сам с ним разговаривал или отвечает за него. */
async function assertAccess(userId: string, role: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      ...(canSeeAllCalls(role as never)
        ? {}
        : { OR: [{ calls: { some: { userId } } }, { ownerId: userId }] }),
    },
    select: CONTACT_SELECT,
  });
  if (!contact) throw notFound('Контакт не найден или недоступен');
  return contact;
}

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const contact = await assertAccess(user.id, user.role, id);

    const calls = await prisma.call.findMany({
      where: { contactId: id, ...callScopeFilter(user) },
      select: CALL_LIST_SELECT,
      orderBy: { startedAt: 'desc' },
      take: 100,
    });

    return { contact, calls };
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const before = await assertAccess(user.id, user.role, id);
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
    } else if (input.ownerId !== undefined && input.ownerId !== before.ownerId) {
      await writeAudit({
        actorId: user.id,
        action: 'contact.owner.update',
        entityType: 'Contact',
        entityId: id,
        meta: { from: before.owner?.name ?? null, to: contact.owner?.name ?? null },
      });
    } else {
      await writeAudit({
        actorId: user.id,
        action: 'contact.update',
        entityType: 'Contact',
        entityId: id,
      });
    }

    return contact;
  });
}
