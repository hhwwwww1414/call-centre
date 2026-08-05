import { handleRoute, notFound } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { callScopeFilter, canSeeAllCalls, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { CALL_LIST_SELECT } from '@/lib/services/calls';
import { contactUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Менеджер работает с контактом, только если сам с ним разговаривал. */
async function assertAccess(userId: string, role: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      ...(canSeeAllCalls(role as never) ? {} : { calls: { some: { userId } } }),
    },
    select: { id: true, name: true, company: true, note: true, isBlocked: true, phoneE164: true },
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

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name?.trim() || null } : {}),
        ...(input.company !== undefined ? { company: input.company?.trim() || null } : {}),
        ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
        ...(input.isBlocked !== undefined ? { isBlocked: input.isBlocked } : {}),
      },
      select: { id: true, phoneE164: true, name: true, company: true, note: true, isBlocked: true },
    });

    if (input.isBlocked !== undefined && input.isBlocked !== before.isBlocked) {
      await writeAudit({
        actorId: user.id,
        action: input.isBlocked ? 'contact.block' : 'contact.unblock',
        entityType: 'Contact',
        entityId: id,
        meta: { phone: contact.phoneE164 },
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
