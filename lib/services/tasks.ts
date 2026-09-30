import {
  CallDirection,
  CallOutcome,
  CallResult,
  CallStatus,
  Role,
  TaskMetric,
  TaskStatus,
  type Call,
  type Prisma,
  type Task,
} from '@prisma/client';

import type { SessionUser } from '@/lib/auth/scope';
import { MIN_RING_SECONDS, MIN_TALK_SECONDS } from '@/lib/call-rules';
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

export { MIN_RING_SECONDS, MIN_TALK_SECONDS } from '@/lib/call-rules';

type TaskWindow = Pick<Task, 'assigneeId' | 'metric' | 'startsAt' | 'dueAt'>;

/** Все исходящие исполнителя внутри окна задачи — кандидаты в прогресс. */
export function taskCallWhere(task: TaskWindow): Prisma.CallWhereInput {
  return {
    userId: task.assigneeId,
    direction: CallDirection.OUTBOUND,
    startedAt: { gte: task.startsAt, ...(task.dueAt ? { lte: task.dueAt } : {}) },
  };
}

export type TaskCallFacts = Pick<
  Call,
  'status' | 'outcome' | 'result' | 'resultAt' | 'durationSeconds' | 'waitSeconds'
>;

/**
 * Почему звонок не идёт в зачёт задачи (null — идёт). Единственное место,
 * где описаны правила: по нему считается прогресс и объясняется хронология.
 */
export function taskCallRejection(metric: TaskMetric, call: TaskCallFacts): string | null {
  if (call.status === CallStatus.RINGING || call.status === CallStatus.IN_PROGRESS) {
    return 'Звонок ещё идёт';
  }
  if (call.status === CallStatus.FAILED) return 'Вызов не состоялся: сбой АТС или неверный номер';

  if (call.status !== CallStatus.COMPLETED) {
    if (metric !== TaskMetric.CALLS) return 'Не дозвонились';
    const earlyDrop =
      (call.status === CallStatus.CANCELED || call.status === CallStatus.NO_ANSWER) &&
      call.waitSeconds !== null &&
      call.waitSeconds < MIN_RING_SECONDS;
    return earlyDrop
      ? `Сброшен через ${call.waitSeconds} с — нужно ждать ответа от ${MIN_RING_SECONDS} с`
      : null;
  }

  // Соединение было, но с кем — знает только менеджер: без итога не засчитываем
  if (!call.resultAt) return 'Ожидает итога менеджера';
  if (call.outcome === CallOutcome.VOICEMAIL) return 'Автоответчик — разговора не было';
  if (call.outcome === CallOutcome.NEW) return 'Не указано, с кем соединились';
  if (metric === TaskMetric.CALLS) return null;

  // Человек ответил и сразу бросил трубку — попытка есть, разговора нет
  if (call.outcome === CallOutcome.HUNG_UP) return 'Клиент сбросил — разговора не было';

  if (call.durationSeconds < MIN_TALK_SECONDS) {
    return `Разговор ${call.durationSeconds} с — короче ${MIN_TALK_SECONDS} с`;
  }
  if (metric === TaskMetric.SUCCESSFUL && call.result !== CallResult.SUCCESS) {
    return 'Итог не «Успешный»';
  }
  return null;
}

const TASK_CALL_FACTS = {
  id: true,
  toNumber: true,
  status: true,
  outcome: true,
  result: true,
  resultAt: true,
  durationSeconds: true,
  waitSeconds: true,
} satisfies Prisma.CallSelect;

/**
 * Какие звонки засчитаны. «Обзвонить 30 человек» — это 30 разных номеров,
 * а не 30 попыток до одного: по каждому номеру зачтён первый подходящий звонок.
 */
export async function creditedTaskCallIds(task: TaskWindow): Promise<Set<string>> {
  const rows = await prisma.call.findMany({
    where: taskCallWhere(task),
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: TASK_CALL_FACTS,
  });
  const numbers = new Set<string>();
  const credited = new Set<string>();
  for (const call of rows) {
    if (numbers.has(call.toNumber) || taskCallRejection(task.metric, call)) continue;
    numbers.add(call.toNumber);
    credited.add(call.id);
  }
  return credited;
}

export async function countTaskProgress(task: TaskWindow): Promise<number> {
  return (await creditedTaskCallIds(task)).size;
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
  if (task.status === TaskStatus.COMPLETED && progress < task.target) {
    current = await prisma.task.update({
      where: { id: task.id },
      data: { status: TaskStatus.ACTIVE, completedAt: null },
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
      where: { assigneeId: userId, status: { in: [TaskStatus.ACTIVE, TaskStatus.COMPLETED] } },
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
        const updated = await prisma.task.updateMany({
          where: { id: task.id, status: TaskStatus.ACTIVE },
          data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
        });
        if (updated.count)
          logger.info({ taskId: task.id, userId, progress }, 'task completed automatically');
      } else {
        await prisma.task.updateMany({
          where: { id: task.id, status: TaskStatus.COMPLETED },
          data: { status: TaskStatus.ACTIVE, completedAt: null },
        });
      }
      // Промежуточный прогресс отдельно не рассылаем: клиенты и так получают
      // событие звонка по SSE и перезапрашивают задачи
    }
  } catch (err) {
    // Пересчёт задач не должен ронять приём звонка
    logger.warn({ err, userId }, 'task sync failed');
  }
}
