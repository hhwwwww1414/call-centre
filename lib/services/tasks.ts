import {
  CallDirection,
  CallResult,
  CallStatus,
  Role,
  TaskMetric,
  TaskStatus,
  type Prisma,
  type Task,
} from '@prisma/client';

import type { SessionUser } from '@/lib/auth/scope';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Ставить задачи и видеть чужие могут админ и супервайзер. */
export function canManageTasks(role: Role): boolean {
  return role === Role.ADMIN || role === Role.SUPERVISOR;
}

/** Менеджер видит только свои задачи, что бы ни пришло с клиента. */
export function taskScopeFilter(user: SessionUser, requestedUserId?: string | null) {
  if (!canManageTasks(user.role)) return { assigneeId: user.id };
  if (requestedUserId) return { assigneeId: requestedUserId };
  return {};
}

const FINISHED_STATUSES: CallStatus[] = [
  CallStatus.COMPLETED,
  CallStatus.MISSED,
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.FAILED,
  CallStatus.CANCELED,
];

type TaskWindow = Pick<Task, 'assigneeId' | 'metric' | 'startsAt' | 'dueAt'>;

/**
 * Какие звонки засчитываются в задачу. Считаем исходящие звонки исполнителя
 * внутри окна задачи — менеджеру не нужно ничего отмечать руками, счётчик
 * растёт сам по событиям телефонии.
 */
export function taskCallWhere(task: TaskWindow): Prisma.CallWhereInput {
  const where: Prisma.CallWhereInput = {
    userId: task.assigneeId,
    direction: CallDirection.OUTBOUND,
    startedAt: { gte: task.startsAt, ...(task.dueAt ? { lte: task.dueAt } : {}) },
  };

  switch (task.metric) {
    case TaskMetric.CALLS:
      where.status = { in: FINISHED_STATUSES };
      break;
    case TaskMetric.ANSWERED:
      where.status = CallStatus.COMPLETED;
      break;
    case TaskMetric.SUCCESSFUL:
      where.result = CallResult.SUCCESS;
      break;
  }

  return where;
}

/**
 * «Обзвонить 30 человек» — это 30 разных номеров, а не 30 попыток
 * дозвониться до одного. Поэтому считаем уникальные номера.
 */
export async function countTaskProgress(task: TaskWindow): Promise<number> {
  const rows = await prisma.call.findMany({
    where: taskCallWhere(task),
    distinct: ['toNumber'],
    select: { id: true },
  });
  return rows.length;
}

export const TASK_SELECT = {
  id: true,
  batchId: true,
  title: true,
  description: true,
  metric: true,
  target: true,
  status: true,
  assigneeId: true,
  startsAt: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  assignee: { select: { id: true, name: true, extension: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

export type TaskView = TaskRow & {
  progress: number;
  percent: number;
  isOverdue: boolean;
};

async function toView(task: TaskRow, now: Date): Promise<TaskView> {
  const progress = await countTaskProgress(task);
  let current = task;

  // Цель достигнута — закрываем задачу сами, без участия менеджера
  if (task.status === TaskStatus.ACTIVE && progress >= task.target) {
    current = await prisma.task.update({
      where: { id: task.id },
      data: { status: TaskStatus.COMPLETED, completedAt: now },
      select: TASK_SELECT,
    });
  }

  return {
    ...current,
    progress,
    percent: Math.min(100, Math.round((progress / Math.max(1, current.target)) * 100)),
    isOverdue:
      current.status === TaskStatus.ACTIVE && current.dueAt !== null && current.dueAt < now,
  };
}

export type TaskListFilter = 'active' | 'completed' | 'canceled' | 'all';

export async function listTasks(
  user: SessionUser,
  filter: TaskListFilter,
  requestedUserId?: string,
): Promise<{ items: TaskView[]; summary: TaskSummary }> {
  const where: Prisma.TaskWhereInput = { ...taskScopeFilter(user, requestedUserId) };
  if (filter === 'completed') where.status = TaskStatus.COMPLETED;
  if (filter === 'canceled') where.status = TaskStatus.CANCELED;

  // Админ смотрит на командную задачу целиком: пока кто-то из группы ещё
  // работает, в «Активных» видны и те, кто уже закончил. Менеджеру — только своё
  const wholeBatches = filter === 'active' && canManageTasks(user.role) && !requestedUserId;
  if (filter === 'active') {
    if (wholeBatches) {
      const activeBatches = await prisma.task.findMany({
        where: { ...where, status: TaskStatus.ACTIVE },
        select: { batchId: true },
        distinct: ['batchId'],
      });
      where.batchId = { in: activeBatches.map((row) => row.batchId) };
    } else {
      where.status = TaskStatus.ACTIVE;
    }
  }

  const rows = await prisma.task.findMany({
    where,
    select: TASK_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 300,
  });

  const now = new Date();
  const items = await Promise.all(rows.map((row) => toView(row, now)));

  // После автозакрытия активная задача могла стать выполненной — убираем
  // её из вкладки «Активные», чтобы список не противоречил сам себе
  const visible =
    filter !== 'active'
      ? items
      : wholeBatches
        ? dropFinishedBatches(items)
        : items.filter((t) => t.status === TaskStatus.ACTIVE);

  return { items: visible, summary: await summarize(user, requestedUserId, now) };
}

/** Группа, где после автозакрытия не осталось активных, уходит из «Активных». */
function dropFinishedBatches(items: TaskView[]): TaskView[] {
  const alive = new Set(items.filter((t) => t.status === TaskStatus.ACTIVE).map((t) => t.batchId));
  return items.filter((t) => alive.has(t.batchId));
}

export type TaskSummary = {
  active: number;
  completed: number;
  overdue: number;
  progress: number;
  target: number;
};

async function summarize(
  user: SessionUser,
  requestedUserId: string | undefined,
  now: Date,
): Promise<TaskSummary> {
  const scope = taskScopeFilter(user, requestedUserId);
  const [active, completed, overdue] = await Promise.all([
    prisma.task.findMany({
      where: { ...scope, status: TaskStatus.ACTIVE },
      select: { assigneeId: true, metric: true, startsAt: true, dueAt: true, target: true },
    }),
    prisma.task.count({ where: { ...scope, status: TaskStatus.COMPLETED } }),
    prisma.task.count({ where: { ...scope, status: TaskStatus.ACTIVE, dueAt: { lt: now } } }),
  ]);

  const progresses = await Promise.all(active.map((task) => countTaskProgress(task)));

  return {
    active: active.length,
    completed,
    overdue,
    // Перевыполнение одной задачи не должно скрывать отставание по другой
    progress: progresses.reduce((sum, p, i) => sum + Math.min(p, active[i]!.target), 0),
    target: active.reduce((sum, task) => sum + task.target, 0),
  };
}

export async function getTaskView(user: SessionUser, id: string): Promise<TaskView | null> {
  const row = await prisma.task.findFirst({
    where: { id, ...taskScopeFilter(user) },
    select: TASK_SELECT,
  });
  return row ? toView(row, new Date()) : null;
}

/**
 * Пересчёт после события звонка: достигнутые цели закрываются сразу, а не
 * при следующем открытии экрана — триггер БД разошлёт это всем по SSE.
 */
export async function syncTaskCompletion(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    const active = await prisma.task.findMany({
      where: { assigneeId: userId, status: TaskStatus.ACTIVE },
      select: {
        id: true,
        assigneeId: true,
        metric: true,
        startsAt: true,
        dueAt: true,
        target: true,
      },
    });

    for (const task of active) {
      const progress = await countTaskProgress(task);
      if (progress >= task.target) {
        await prisma.task.updateMany({
          where: { id: task.id, status: TaskStatus.ACTIVE },
          data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
        });
        logger.info({ taskId: task.id, userId, progress }, 'task completed automatically');
      }
      // Промежуточный прогресс отдельно не рассылаем: клиенты и так получают
      // событие звонка по SSE и перезапрашивают задачи
    }
  } catch (err) {
    // Пересчёт задач не должен ронять приём звонка
    logger.warn({ err, userId }, 'task sync failed');
  }
}
