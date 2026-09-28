'use client';

import type { Role } from '@prisma/client';
import { ArrowRight, Flag, ListChecks, Plus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { canManageTasksRole, DueLabel, taskTone } from '@/components/tasks/tasks-screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { useTasks } from '@/lib/client/hooks';
import type { TaskItem } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';

const LIMIT = 4;

/**
 * Задачи на дашборде: менеджер начинает день с цели, админ — с того,
 * как команда к ней идёт. Полоски обновляются по realtime сами.
 */
export function TasksWidget({ role, timezone }: { role: Role; timezone: string }) {
  const manager = !canManageTasksRole(role);
  const { data, isLoading } = useTasks({ status: 'active' });

  const rows = React.useMemo(
    () => (manager ? toRows(data?.items ?? []) : toGroups(data?.items ?? [])),
    [data?.items, manager],
  );

  if (isLoading) return <Skeleton className="h-36 w-full rounded-xl" />;
  if (rows.length === 0 && manager) return null;

  return (
    <Card className="border-[var(--brand)]/25">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListChecks
            className="size-4 text-[var(--brand)] dark:text-[var(--brand-text)]"
            aria-hidden
          />
          <CardTitle>{manager ? ru.tasks.myTasks : ru.tasks.teamTasks}</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tasks">
            {ru.tasks.allTasks}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--border-strong)] p-4">
            <p className="text-xs text-[var(--text-secondary)]">{ru.tasks.emptyAdminHint}</p>
            <Button variant="primary" size="sm" asChild>
              <Link href="/tasks">
                <Plus aria-hidden />
                {ru.tasks.create}
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            {rows.slice(0, LIMIT).map((row) => (
              <li key={row.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-medium text-[var(--foreground)]">
                    {row.title}
                  </span>
                  <span className="numeric shrink-0 text-xs font-semibold text-[var(--foreground)]">
                    {row.progress}
                    <span className="font-normal text-[var(--text-muted)]"> / {row.target}</span>
                  </span>
                </div>
                <ProgressBar value={row.percent} tone={taskTone(row.head)} label={row.title} />
                <div className="text-2xs flex items-center justify-between gap-2 text-[var(--text-muted)]">
                  <span className="truncate">{row.caption}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Flag className="size-3" aria-hidden />
                    <DueLabel task={row.head} timezone={timezone} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type Row = {
  key: string;
  title: string;
  caption: string;
  progress: number;
  target: number;
  percent: number;
  head: TaskItem;
};

function toRows(items: TaskItem[]): Row[] {
  return items.map((task) => ({
    key: task.id,
    title: task.title,
    caption: ru.taskMetric[task.metric],
    progress: task.progress,
    target: task.target,
    percent: task.percent,
    head: task,
  }));
}

/** Для админа — одна строка на задачу команды, отстающие сверху. */
function toGroups(items: TaskItem[]): Row[] {
  const groups = new Map<string, TaskItem[]>();
  for (const task of items) groups.set(task.batchId, [...(groups.get(task.batchId) ?? []), task]);

  return Array.from(groups, ([batchId, tasks]) => {
    const head = tasks[0]!;
    const target = tasks.reduce((sum, t) => sum + t.target, 0);
    const progress = tasks.reduce((sum, t) => sum + Math.min(t.progress, t.target), 0);
    return {
      key: batchId,
      title: head.title,
      caption:
        tasks.length > 1
          ? `${ru.tasks.member(tasks.length)} · ${ru.taskMetric[head.metric]}`
          : head.assignee.name,
      progress,
      target,
      percent: target > 0 ? Math.round((progress / target) * 100) : 0,
      head: { ...head, isOverdue: tasks.some((t) => t.isOverdue) },
    };
  }).sort((a, b) => a.percent - b.percent);
}
