import { badRequest, handleRoute, notFound } from '@/lib/api';
import { CallResult, CallStatus } from '@prisma/client';
import { isNoConversation } from '@/lib/call-rules';
import { writeAudit } from '@/lib/audit';
import { callScopeFilter, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { getCallForUser } from '@/lib/services/calls';
import { syncTaskCompletion } from '@/lib/services/tasks';
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
      select: {
        id: true,
        outcome: true,
        comment: true,
        tags: true,
        result: true,
        userId: true,
        summary: true,
        isImportant: true,
        status: true,
      },
    });
    if (!existing) throw notFound('Звонок не найден или недоступен');
    const nextOutcome = input.outcome ?? existing.outcome;
    const nextResult = input.result === undefined ? existing.result : input.result;
    if (isNoConversation(nextOutcome) && nextResult === CallResult.SUCCESS) {
      throw badRequest('Без разговора звонок не может быть успешным');
    }
    if (isNoConversation(input.outcome) && existing.status !== CallStatus.COMPLETED) {
      throw badRequest('Этот исход можно отметить только у звонка, на который ответили');
    }

    const data: Record<string, unknown> = {};
    if (input.outcome !== undefined) data.outcome = input.outcome;
    if (input.comment !== undefined) data.comment = input.comment?.trim() || null;
    if (input.tags !== undefined) {
      data.tags = Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean)));
    }

    if (input.summary !== undefined) data.summary = input.summary?.trim() || null;
    if (input.isImportant !== undefined) data.isImportant = input.isImportant;
    if (input.result !== undefined) {
      data.result = input.result;
      data.resultAt = input.result ? new Date() : null;
      data.resultById = input.result ? user.id : null;
    }

    if (Object.keys(data).length === 0) return { ok: true };

    const call = await prisma.call.update({
      where: { id },
      data,
      select: {
        id: true,
        outcome: true,
        comment: true,
        tags: true,
        result: true,
        summary: true,
        isImportant: true,
        updatedAt: true,
      },
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
        meta: { from: existing.comment, to: call.comment },
      });
    }
    if (input.tags !== undefined && JSON.stringify(existing.tags) !== JSON.stringify(call.tags)) {
      await writeAudit({
        actorId: user.id,
        action: 'call.tags.update',
        entityType: 'Call',
        entityId: id,
        meta: { from: existing.tags, to: call.tags },
      });
    }

    for (const field of ['summary', 'isImportant'] as const) {
      if (input[field] !== undefined && existing[field] !== call[field]) {
        await writeAudit({
          actorId: user.id,
          action: field === 'summary' ? 'call.summary.update' : 'call.important.update',
          entityType: 'Call',
          entityId: id,
          meta: { from: existing[field], to: call[field] },
        });
      }
    }

    if (input.result !== undefined && input.result !== existing.result) {
      await writeAudit({
        actorId: user.id,
        action: 'call.result.update',
        entityType: 'Call',
        entityId: id,
        meta: { from: existing.result, to: input.result },
      });
    }

    if (input.result !== undefined || input.outcome !== undefined) {
      await syncTaskCompletion(existing.userId);
    }

    return call;
  });
}
