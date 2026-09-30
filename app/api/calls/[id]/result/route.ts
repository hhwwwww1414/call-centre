import { badRequest, handleRoute, notFound } from '@/lib/api';
import { CallOutcome, CallStatus } from '@prisma/client';
import { writeAudit } from '@/lib/audit';
import { isNoConversation } from '@/lib/call-rules';
import { callScopeFilter, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { syncTaskCompletion } from '@/lib/services/tasks';
import { callResultSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Итог звонка из всплывающего окна — одним запросом, без автосохранения по полям. */
export async function POST(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const input = callResultSchema.parse(await request.json());

    const existing = await prisma.call.findFirst({
      where: { id, ...callScopeFilter(user) },
      select: { id: true, userId: true, result: true, status: true },
    });
    if (!existing) throw notFound('Звонок не найден или недоступен');
    if (
      existing.status === CallStatus.COMPLETED &&
      (!input.outcome || input.outcome === CallOutcome.NEW)
    ) {
      throw badRequest('Укажите исход соединения: разговор с человеком или автоответчик');
    }
    if (existing.status !== CallStatus.COMPLETED && isNoConversation(input.outcome)) {
      throw badRequest('Этот исход можно отметить только у звонка, на который ответили');
    }

    const call = await prisma.call.update({
      where: { id },
      data: {
        result: input.result,
        summary: input.summary || null,
        isImportant: input.isImportant,
        ...(input.outcome ? { outcome: input.outcome } : {}),
        resultAt: new Date(),
        resultById: user.id,
      },
      select: { id: true, result: true, summary: true, isImportant: true, outcome: true },
    });

    await writeAudit({
      actorId: user.id,
      action: 'call.result.update',
      entityType: 'Call',
      entityId: id,
      meta: { from: existing.result, to: input.result, important: input.isImportant },
    });

    // Метрика «успешные звонки» зависит от этой отметки
    await syncTaskCompletion(existing.userId);

    return call;
  });
}
