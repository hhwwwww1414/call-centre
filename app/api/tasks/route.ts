import { randomUUID } from 'node:crypto';

import { badRequest, handleRoute } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { AuthError, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { canManageTasks, listTasks } from '@/lib/services/tasks';
import { parseQuery, taskCreateSchema, taskFiltersSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const filters = parseQuery(taskFiltersSchema, request.url);
    return listTasks(user, filters.status, filters.userId);
  });
}

/**
 * Постановка задачи. Выбрано несколько менеджеров — каждому своя задача
 * со своим счётчиком, объединённые batchId в одну карточку у админа.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    if (!canManageTasks(user.role)) throw new AuthError('Ставить задачи может администратор', 403);

    const input = taskCreateSchema.parse(await request.json());
    const assigneeIds = Array.from(new Set(input.assigneeIds));

    const assignees = await prisma.user.findMany({
      where: { id: { in: assigneeIds }, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (assignees.length !== assigneeIds.length) {
      throw badRequest('Часть менеджеров не найдена или им закрыт доступ', {
        assigneeIds: 'Проверьте список исполнителей',
      });
    }

    const batchId = randomUUID();
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;

    await prisma.task.createMany({
      data: assigneeIds.map((assigneeId) => ({
        batchId,
        title: input.title,
        description: input.description || null,
        metric: input.metric,
        target: input.target,
        assigneeId,
        createdById: user.id,
        startsAt,
        dueAt,
      })),
    });

    await writeAudit({
      actorId: user.id,
      action: 'task.create',
      entityType: 'Task',
      entityId: batchId,
      meta: {
        title: input.title,
        metric: input.metric,
        target: input.target,
        assignees: assigneeIds.length,
      },
    });

    return { ok: true, batchId, created: assigneeIds.length };
  });
}
