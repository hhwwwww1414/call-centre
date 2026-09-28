'use client';

import type { Role } from '@prisma/client';
import {
  AlarmClock,
  CheckCircle2,
  ClipboardList,
  Flag,
  ListChecks,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { KpiCard } from '@/components/dashboard/kpi-card';
import { TaskCreateDialog } from '@/components/tasks/task-create-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { ProgressBar, ProgressRing, type ProgressTone } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDeleteTask, useTaskAssignees, useTasks, useUpdateTask } from '@/lib/client/hooks';
import type { TaskItem } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatInZone, formatTimeLeft } from '@/lib/time';
import { cn } from '@/lib/utils';

type Tab = 'active' | 'completed' | 'canceled' | 'all';
const ALL = '__all__';

export function canManageTasksRole(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPERVISOR';
}

export function TasksScreen({ role, timezone }: { role: Role; timezone: string }) {
  const manager = !canManageTasksRole(role);
  const [tab, setTab] = React.useState<Tab>('active');
  const [userId, setUserId] = React.useState(ALL);
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data, isLoading, isError, refetch } = useTasks({
    status: tab,
    userId: userId === ALL ? undefined : userId,
  });
  const assignees = useTaskAssignees(!manager);

  const summary = data?.summary;
  const overall = summary && summary.target > 0 ? (summary.progress / summary.target) * 100 : 0;
  const groups = React.useMemo(() => groupByBatch(data?.items ?? []), [data?.items]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="surface-card col-span-2 flex items-center gap-4 p-4 sm:p-5 lg:col-span-1">
          {isLoading ? (
            <Skeleton className="size-16 rounded-full" />
          ) : (
            <ProgressRing value={overall} tone={overall >= 100 ? 'success' : 'brand'}>
              <span className="numeric text-xs font-semibold text-[var(--foreground)]">
                {Math.round(overall)}%
              </span>
            </ProgressRing>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              {ru.tasks.summaryProgress}
            </p>
            <p className="display-heading numeric mt-1 text-xl text-[var(--foreground)]">
              {summary ? ru.tasks.progress(summary.progress, summary.target) : '—'}
            </p>
          </div>
        </div>
        <KpiCard
          label={ru.tasks.summaryActive}
          value={summary?.active ?? 0}
          icon={ListChecks}
          loading={isLoading}
        />
        <KpiCard
          label={ru.tasks.summaryCompleted}
          value={summary?.completed ?? 0}
          icon={CheckCircle2}
          tone="success"
          loading={isLoading}
        />
        <KpiCard
          label={ru.tasks.summaryOverdue}
          value={summary?.overdue ?? 0}
          icon={AlarmClock}
          tone={summary && summary.overdue > 0 ? 'danger' : 'neutral'}
          loading={isLoading}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="active">{ru.tasks.tabActive}</TabsTrigger>
            <TabsTrigger value="completed">{ru.tasks.tabCompleted}</TabsTrigger>
            <TabsTrigger value="canceled">{ru.tasks.tabCanceled}</TabsTrigger>
            <TabsTrigger value="all">{ru.tasks.tabAll}</TabsTrigger>
          </TabsList>
        </Tabs>

        {!manager ? (
          <>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full sm:w-56" aria-label={ru.tasks.filterManager}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{ru.tasks.allManagers}</SelectItem>
                {(assignees.data?.items ?? []).map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="primary" className="sm:ml-auto" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              {ru.tasks.create}
            </Button>
          </>
        ) : null}
      </div>

      {isError ? (
        <Card>
          <EmptyState
            title={ru.errors.loadFailed}
            hint={ru.errors.genericHint}
            action={
              <Button size="sm" onClick={() => void refetch()}>
                {ru.common.retry}
              </Button>
            }
          />
        </Card>
      ) : isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-5" aria-hidden />}
            title={
              tab !== 'active' && tab !== 'all'
                ? ru.tasks.emptyFiltered
                : manager
                  ? ru.tasks.emptyManager
                  : ru.tasks.empty
            }
            hint={manager ? ru.tasks.emptyManagerHint : ru.tasks.emptyAdminHint}
            action={
              !manager && tab === 'active' ? (
                <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden />
                  {ru.tasks.create}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : manager ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {(data?.items ?? []).map((task) => (
            <MyTaskCard key={task.id} task={task} timezone={timezone} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {groups.map((group) => (
            <TaskGroupCard key={group.batchId} tasks={group.tasks} timezone={timezone} />
          ))}
        </div>
      )}

      {!manager ? <TaskCreateDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
    </div>
  );
}

function groupByBatch(items: TaskItem[]) {
  const map = new Map<string, TaskItem[]>();
  for (const task of items) {
    const list = map.get(task.batchId) ?? [];
    list.push(task);
    map.set(task.batchId, list);
  }
  return Array.from(map, ([batchId, tasks]) => ({
    batchId,
    tasks: tasks.sort((a, b) => b.percent - a.percent),
  }));
}

export function taskTone(task: Pick<TaskItem, 'status' | 'isOverdue'>): ProgressTone {
  if (task.status === 'COMPLETED') return 'success';
  if (task.status === 'CANCELED') return 'muted';
  if (task.isOverdue) return 'danger';
  return 'brand';
}

export function TaskStatusBadge({ task }: { task: Pick<TaskItem, 'status' | 'isOverdue'> }) {
  if (task.status === 'COMPLETED') {
    return (
      <Badge tone="success">
        <CheckCircle2 className="size-3" aria-hidden />
        {ru.taskStatus.COMPLETED}
      </Badge>
    );
  }
  if (task.status === 'CANCELED') return <Badge tone="outline">{ru.taskStatus.CANCELED}</Badge>;
  if (task.isOverdue) {
    return (
      <Badge tone="danger">
        <AlarmClock className="size-3" aria-hidden />
        {ru.tasks.overdue}
      </Badge>
    );
  }
  return <Badge tone="brand">{ru.taskStatus.ACTIVE}</Badge>;
}

export function DueLabel({ task, timezone }: { task: TaskItem; timezone: string }) {
  if (task.status === 'COMPLETED' && task.completedAt) {
    return (
      <span>
        {ru.tasks.completedAt} {formatInZone(task.completedAt, timezone, 'short')}
      </span>
    );
  }
  if (!task.dueAt) return <span>{ru.tasks.noDue}</span>;
  if (task.isOverdue) {
    return (
      <span className="text-[var(--destructive)]">
        {ru.tasks.overdue} на {formatTimeLeft(task.dueAt)}
      </span>
    );
  }
  return (
    <span title={formatInZone(task.dueAt, timezone, 'datetime')}>
      {ru.tasks.dueIn} {formatTimeLeft(task.dueAt)}
    </span>
  );
}

/** Карточка менеджера: крупный счётчик и сколько осталось — чтобы видеть цель. */
function MyTaskCard({ task, timezone }: { task: TaskItem; timezone: string }) {
  const left = Math.max(0, task.target - task.progress);
  return (
    <Card
      className={cn(
        'flex flex-col gap-4 p-4 sm:p-5',
        task.status === 'COMPLETED' && 'border-[var(--success)]/30',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-[var(--foreground)]">
            {task.title}
          </h2>
          <p className="text-2xs mt-0.5 text-[var(--text-muted)]">{ru.taskMetric[task.metric]}</p>
        </div>
        <TaskStatusBadge task={task} />
      </div>

      <div className="flex items-end justify-between gap-3">
        <p className="display-heading numeric text-2xl leading-none text-[var(--foreground)]">
          {task.progress}
          <span className="text-base text-[var(--text-muted)]"> / {task.target}</span>
        </p>
        <p className="numeric text-xs font-medium text-[var(--text-secondary)]">
          {task.status === 'ACTIVE' ? ru.tasks.left(left) : `${task.percent}%`}
        </p>
      </div>

      <ProgressBar value={task.percent} tone={taskTone(task)} size="lg" label={task.title} />

      {task.description ? (
        <p className="rounded-lg bg-[var(--surface-2)] p-3 text-xs whitespace-pre-line text-[var(--text-secondary)]">
          {task.description}
        </p>
      ) : null}

      <div className="text-2xs flex flex-wrap items-center justify-between gap-2 text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <Flag className="size-3" aria-hidden />
          <DueLabel task={task} timezone={timezone} />
        </span>
        {task.createdBy ? (
          <span>
            {ru.tasks.assignedBy}: {task.createdBy.name}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Карточка админа: одна задача, выданная команде, и полоска по каждому
 * исполнителю — сразу видно, кто отстаёт.
 */
function TaskGroupCard({ tasks, timezone }: { tasks: TaskItem[]; timezone: string }) {
  const head = tasks[0]!;
  const target = tasks.reduce((sum, t) => sum + t.target, 0);
  const progress = tasks.reduce((sum, t) => sum + Math.min(t.progress, t.target), 0);
  const percent = target > 0 ? (progress / target) * 100 : 0;
  const done = tasks.filter((t) => t.status === 'COMPLETED').length;
  const anyOverdue = tasks.some((t) => t.isOverdue);

  return (
    <Card className="flex flex-col">
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-[var(--foreground)]">
              {head.title}
            </h2>
            <p className="text-2xs mt-0.5 flex flex-wrap items-center gap-x-2 text-[var(--text-muted)]">
              <span>
                {ru.taskMetric[head.metric]} · цель {head.target} на человека
              </span>
              <span className="flex items-center gap-1">
                <Flag className="size-3" aria-hidden />
                <DueLabel task={head} timezone={timezone} />
              </span>
            </p>
          </div>
          {tasks.length > 1 ? (
            <Badge tone={done === tasks.length ? 'success' : 'neutral'}>
              {done}/{tasks.length}
            </Badge>
          ) : (
            <TaskStatusBadge task={head} />
          )}
        </div>

        {tasks.length > 1 ? (
          <div className="flex items-center gap-3">
            <ProgressBar
              value={percent}
              tone={percent >= 100 ? 'success' : anyOverdue ? 'danger' : 'brand'}
              label={`${ru.tasks.team}: ${head.title}`}
            />
            <span className="numeric shrink-0 text-xs font-medium text-[var(--text-secondary)]">
              {ru.tasks.progress(progress, target)}
            </span>
          </div>
        ) : null}

        {head.description ? (
          <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">{head.description}</p>
        ) : null}
      </div>

      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {tasks.map((task) => (
          <AssigneeRow key={task.id} task={task} showStatus={tasks.length > 1} />
        ))}
      </ul>
    </Card>
  );
}

function AssigneeRow({ task, showStatus }: { task: TaskItem; showStatus: boolean }) {
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const setStatus = (status: 'ACTIVE' | 'CANCELED') =>
    update.mutate(
      { id: task.id, status },
      {
        onError: (error) => toast.error(error instanceof Error ? error.message : ru.errors.generic),
      },
    );

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <Avatar name={task.assignee.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-[var(--foreground)]">
            {task.assignee.name}
          </span>
          <span className="numeric text-2xs shrink-0 text-[var(--text-secondary)]">
            {ru.tasks.progress(task.progress, task.target)} · {task.percent}%
          </span>
        </div>
        <ProgressBar
          value={task.percent}
          tone={taskTone(task)}
          size="sm"
          className="mt-1.5"
          label={task.assignee.name}
        />
      </div>
      {showStatus && task.status !== 'ACTIVE' ? (
        <span className="hidden sm:block">
          <TaskStatusBadge task={task} />
        </span>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ru.common.actions}
            className="size-8 shrink-0"
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {task.status === 'ACTIVE' ? (
            <DropdownMenuItem onSelect={() => setStatus('CANCELED')}>
              <XCircle className="size-4" aria-hidden />
              {ru.tasks.cancel}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setStatus('ACTIVE')}>
              <RotateCcw className="size-4" aria-hidden />
              {ru.tasks.reopen}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-[var(--destructive)]"
            onSelect={() => {
              if (!window.confirm(ru.tasks.deleteConfirm)) return;
              remove.mutate(task.id, {
                onError: (error) =>
                  toast.error(error instanceof Error ? error.message : ru.errors.generic),
              });
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            {ru.tasks.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
