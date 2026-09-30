import { TaskStatus } from '@prisma/client';

import { badRequest, handleRoute, notFound } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { AuthError, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { canManageTasks, getTaskView } from '@/lib/services/tasks';
import { taskUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const task = await getTaskView(user, id);
    if (!task) throw notFound('Задача не найдена');
    return task;
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    if (!canManageTasks(user.role)) throw new AuthError('Менять задачи может администратор', 403);

    const { id } = await params;
    const input = taskUpdateSchema.parse(await request.json());
    if (input.status === TaskStatus.COMPLETED) {
      throw badRequest(
        'Задача завершается автоматически, когда подтверждённый прогресс достигает цели',
      );
    }

    const existing = await prisma.task.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw notFound('Задача не найдена');

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description || null;
    if (input.target !== undefined) data.target = input.target;
    if (input.dueAt !== undefined) data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (input.status !== undefined && input.status !== existing.status) {
      data.status = input.status;
      data.completedAt = null;
    }

    await prisma.task.update({ where: { id }, data });

    await writeAudit({
      actorId: user.id,
      action: input.status === TaskStatus.CANCELED ? 'task.cancel' : 'task.update',
      entityType: 'Task',
      entityId: id,
      meta: { fields: Object.keys(data) },
    });

    return getTaskView(user, id);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    if (!canManageTasks(user.role)) throw new AuthError('Удалять задачи может администратор', 403);

    const { id } = await params;
    const existing = await prisma.task.findUnique({ where: { id }, select: { title: true } });
    if (!existing) throw notFound('Задача не найдена');

    await prisma.task.delete({ where: { id } });
    await writeAudit({
      actorId: user.id,
      action: 'task.delete',
      entityType: 'Task',
      entityId: id,
      meta: { title: existing.title },
    });

    return { ok: true };
  });
}
