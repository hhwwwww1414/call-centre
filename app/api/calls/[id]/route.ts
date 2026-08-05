import { handleRoute, notFound } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { callScopeFilter, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { getCallForUser } from '@/lib/services/calls';
import { callUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const result = await getCallForUser(user, id);
    if (!result) throw notFound('Звонок не найден или недоступен');
    return result;
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const input = callUpdateSchema.parse(await request.json());

    // Проверяем доступ отдельным запросом: менеджер не должен уметь
    // отредактировать чужой звонок, подставив его id
    const existing = await prisma.call.findFirst({
      where: { id, ...callScopeFilter(user) },
      select: { id: true, outcome: true, comment: true, tags: true },
    });
    if (!existing) throw notFound('Звонок не найден или недоступен');

    const data: Record<string, unknown> = {};
    if (input.outcome !== undefined) data.outcome = input.outcome;
    if (input.comment !== undefined) data.comment = input.comment?.trim() || null;
    if (input.tags !== undefined) {
      data.tags = Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean)));
    }

    if (Object.keys(data).length === 0) return { ok: true };

    const call = await prisma.call.update({
      where: { id },
      data,
      select: { id: true, outcome: true, comment: true, tags: true, updatedAt: true },
    });

    if (input.outcome !== undefined && input.outcome !== existing.outcome) {
      await writeAudit({
        actorId: user.id,
        action: 'call.outcome.update',
        entityType: 'Call',
        entityId: id,
        meta: { from: existing.outcome, to: input.outcome },
      });
    }
    if (input.comment !== undefined && (input.comment?.trim() || null) !== existing.comment) {
      await writeAudit({
        actorId: user.id,
        action: 'call.comment.update',
        entityType: 'Call',
        entityId: id,
      });
    }
    if (input.tags !== undefined) {
      await writeAudit({
        actorId: user.id,
        action: 'call.tags.update',
        entityType: 'Call',
        entityId: id,
        meta: { tags: call.tags },
      });
    }

    return call;
  });
}
