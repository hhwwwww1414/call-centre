'use client';

import { ArrowUpRight, PhoneOutgoing } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { useTaskActivity } from '@/lib/client/hooks';
import type { TaskActivityResponse } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { formatInZone } from '@/lib/time';

type Audit = TaskActivityResponse['audits'][number];

function seconds(value: number): string {
  return value < 60 ? `${value} с` : `${Math.floor(value / 60)} мин ${value % 60} с`;
}

/** «Новый → Автоответчик»: для итога и результата показываем, что именно сменили. */
function auditChange(audit: Audit): string {
  const dict: Record<string, string> | undefined =
    audit.action === 'call.outcome.update'
      ? ru.callOutcome
      : audit.action === 'call.result.update'
        ? { SUCCESS: ru.callResult.SUCCESS, FAILURE: ru.callResult.FAILURE }
        : undefined;
  if (!dict || !audit.meta) return '';
  const label = (value: unknown) =>
    typeof value === 'string' ? (dict[value] ?? value) : 'не указан';
  return audit.meta.from === undefined
    ? `: ${label(audit.meta.to)}`
    : `: ${label(audit.meta.from)} → ${label(audit.meta.to)}`;
}

export function TaskActivityDialog({
  id,
  onOpenChange,
  timezone,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
  timezone: string;
}) {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTaskActivity(id);
  const first = data?.pages[0];
  const task = first?.task;
  const calls = data?.pages.flatMap((page) => page.calls) ?? [];
  const events = [
    ...calls.map((call) => ({ kind: 'call' as const, at: call.startedAt, call })),
    ...(data?.pages.flatMap((page) => page.audits) ?? []).map((audit) => ({
      kind: 'audit' as const,
      at: audit.createdAt,
      audit,
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  // Правка итога задним числом видна рядом с номером, которого она касается
  const callLabels = new Map(
    calls.map((call) => [call.id, call.contact?.name || formatPhone(call.toNumber)]),
  );

  return (
    <Dialog open={Boolean(id)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task?.title ?? 'Хронология задачи'}</DialogTitle>
          <DialogDescription>
            {task
              ? `${task.assignee.name} · ${ru.taskMetric[task.metric]}`
              : 'Звонки и действия по задаче'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {isLoading ? <Skeleton className="h-32 w-full rounded-lg" /> : null}
          {isError ? (
            <button
              type="button"
              className="text-sm text-[var(--destructive)] underline"
              onClick={() => void refetch()}
            >
              Не удалось загрузить. Повторить
            </button>
          ) : null}
          {task ? (
            <div className="space-y-2 rounded-lg bg-[var(--surface-2)] p-3">
              <div className="flex justify-between gap-3 text-sm">
                <span>Подтверждённый прогресс</span>
                <strong className="numeric">
                  {task.progress} / {task.target}
                </strong>
              </div>
              <ProgressBar value={task.percent} label={task.title} />
              <p className="text-xs text-[var(--text-muted)]">
                {ru.taskMetricHint[task.metric]}. Один номер засчитывается один раз.
              </p>
            </div>
          ) : null}
          {first && first.total > calls.length ? (
            <p className="text-xs text-[var(--text-muted)]">
              Показаны последние {calls.length} из {first.total} звонков.
            </p>
          ) : null}
          {first && events.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">Действий пока нет</p>
          ) : null}
          <ol className="space-y-2">
            {events.map((event) =>
              event.kind === 'call' ? (
                <li
                  key={`call-${event.call.id}`}
                  className="rounded-lg border border-[var(--border)] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <PhoneOutgoing
                        className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/calls/${event.call.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--foreground)] hover:underline"
                        >
                          {event.call.contact?.name || formatPhone(event.call.toNumber)}
                          <ArrowUpRight className="size-3" aria-hidden />
                        </Link>
                        {event.call.contact?.name ? (
                          <p className="numeric text-xs text-[var(--text-muted)]">
                            {formatPhone(event.call.toNumber)}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {[
                            ru.callStatus[event.call.status],
                            event.call.status === 'COMPLETED'
                              ? `разговор ${seconds(event.call.durationSeconds)}`
                              : event.call.waitSeconds !== null
                                ? `ожидание ${seconds(event.call.waitSeconds)}`
                                : null,
                            event.call.outcome !== 'NEW'
                              ? ru.callOutcome[event.call.outcome]
                              : null,
                            event.call.result ? ru.callResult[event.call.result] : 'без итога',
                            event.call.recordingReady ? 'есть запись' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {event.call.reason ? (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {event.call.reason}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={event.call.credited ? 'success' : 'neutral'}>
                        {event.call.credited ? 'Засчитан' : 'Не засчитан'}
                      </Badge>
                      <time className="numeric text-xs text-[var(--text-muted)]">
                        {formatInZone(event.at, timezone, 'datetime')}
                      </time>
                    </div>
                  </div>
                  {event.call.summary ? (
                    <p className="mt-2 text-xs whitespace-pre-line text-[var(--text-secondary)]">
                      {event.call.summary}
                    </p>
                  ) : null}
                </li>
              ) : (
                <li
                  key={`audit-${event.audit.id}`}
                  className="flex justify-between gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-secondary)]"
                >
                  <span>
                    {ru.auditActions[event.audit.action] ?? event.audit.action}
                    {auditChange(event.audit)}
                    {callLabels.get(event.audit.entityId)
                      ? ` · ${callLabels.get(event.audit.entityId)}`
                      : ''}
                    {event.audit.actor ? ` · ${event.audit.actor.name}` : ''}
                  </span>
                  <time className="numeric shrink-0">
                    {formatInZone(event.at, timezone, 'datetime')}
                  </time>
                </li>
              ),
            )}
          </ol>
          {hasNextPage ? (
            <button
              type="button"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Загружаем…' : 'Показать более ранние звонки'}
            </button>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
