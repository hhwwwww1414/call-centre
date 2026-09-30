'use client';

import { Check, Info, PenLine, PhoneOutgoing } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { useTaskActivity } from '@/lib/client/hooks';
import type { TaskActivityResponse } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { cn, formatDuration } from '@/lib/utils';

type ActivityCall = TaskActivityResponse['calls'][number];
type Audit = TaskActivityResponse['audits'][number];
type Filter = 'all' | 'credited' | 'rejected';
type Event =
  { kind: 'call'; at: string; call: ActivityCall } | { kind: 'audit'; at: string; audit: Audit };

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'credited', label: 'Засчитаны' },
  { value: 'rejected', label: 'Не засчитаны' },
];

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

function callFacts(call: ActivityCall): string {
  return [
    call.status === 'COMPLETED' ? formatDuration(call.durationSeconds) : ru.callStatus[call.status],
    call.outcome !== 'NEW' ? ru.callOutcome[call.outcome] : null,
    call.result ? ru.callResult[call.result] : null,
  ]
    .filter(Boolean)
    .join(' · ');
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
  const [filter, setFilter] = React.useState<Filter>('all');
  React.useEffect(() => setFilter('all'), [id]);

  const first = data?.pages[0];
  const task = first?.task;
  const calls = data?.pages.flatMap((page) => page.calls) ?? [];
  const audits = data?.pages.flatMap((page) => page.audits) ?? [];
  const counts = {
    all: calls.length,
    credited: calls.filter((call) => call.credited).length,
    rejected: calls.filter((call) => !call.credited).length,
  };

  // Правка итога задним числом видна рядом с номером, которого она касается
  const callLabels = new Map(
    calls.map((call) => [call.id, call.contact?.name || formatPhone(call.toNumber)]),
  );
  const visibleCalls = calls.filter(
    (call) => filter === 'all' || (filter === 'credited' ? call.credited : !call.credited),
  );
  const events: Event[] = [
    ...visibleCalls.map((call) => ({ kind: 'call' as const, at: call.startedAt, call })),
    ...(filter === 'all'
      ? audits.map((audit) => ({ kind: 'audit' as const, at: audit.createdAt, audit }))
      : []),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const today = formatInZone(new Date(), timezone, 'date');
  const yesterday = formatInZone(new Date(Date.now() - 86_400_000), timezone, 'date');
  const dayName = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  });
  const days: { label: string; events: Event[] }[] = [];
  for (const event of events) {
    const day = formatInZone(event.at, timezone, 'date');
    const label =
      day === today ? 'Сегодня' : day === yesterday ? 'Вчера' : dayName.format(new Date(event.at));
    const last = days.at(-1);
    if (last?.label === label) last.events.push(event);
    else days.push({ label, events: [event] });
  }

  return (
    <Dialog open={Boolean(id)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-2xl flex-col overflow-hidden p-0 sm:max-h-[min(860px,calc(100dvh-4rem))]">
        <DialogHeader className="gap-0.5 pb-4">
          <DialogTitle>{task?.title ?? 'Задача'}</DialogTitle>
          <DialogDescription>
            {task ? `${task.assignee.name} · ${ru.taskMetric[task.metric]}` : ' '}
          </DialogDescription>
        </DialogHeader>

        {task ? (
          <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 pb-4">
            <div className="flex items-end justify-between gap-3">
              <p className="numeric text-2xl leading-none font-semibold tracking-tight text-[var(--foreground)]">
                {task.progress}
                <span className="text-base font-normal text-[var(--text-muted)]">
                  {' '}
                  из {task.target}
                </span>
              </p>
              <span
                className="text-2xs flex items-center gap-1 text-[var(--text-muted)]"
                title={`${ru.taskMetricHint[task.metric]}. Один номер засчитывается один раз`}
              >
                <Info className="size-3.5" aria-hidden />
                <span className="numeric">{task.percent}%</span>
              </span>
            </div>
            <ProgressBar value={task.percent} label={task.title} />
            <div
              role="tablist"
              aria-label="Фильтр звонков"
              className="mt-1 inline-flex self-start rounded-[10px] bg-[var(--surface)] p-0.5"
            >
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs transition-colors duration-150 max-md:h-9',
                    filter === item.value
                      ? 'shadow-soft bg-[var(--card)] font-medium text-[var(--foreground)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--foreground)]',
                  )}
                >
                  {item.label}
                  <span className="numeric text-[var(--text-muted)]">{counts[item.value]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
          {isLoading ? (
            <div className="flex flex-col gap-3 pt-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : null}
          {isError ? (
            <div className="py-8 text-center">
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Повторить загрузку
              </Button>
            </div>
          ) : null}
          {first && days.length === 0 ? (
            <div className="py-8">
              <EmptyState title="Звонков пока нет" />
            </div>
          ) : null}

          {days.map((day) => (
            <section key={day.label}>
              <h3 className="text-2xs sticky top-0 z-10 bg-[var(--popover)] pt-3 pb-1.5 font-medium text-[var(--text-muted)]">
                {day.label}
              </h3>
              <ol className="relative">
                {day.events.map((event) =>
                  event.kind === 'call' ? (
                    <CallRow key={`c-${event.call.id}`} call={event.call} timezone={timezone} />
                  ) : (
                    <AuditRow
                      key={`a-${event.audit.id}`}
                      audit={event.audit}
                      subject={callLabels.get(event.audit.entityId)}
                      timezone={timezone}
                    />
                  ),
                )}
              </ol>
            </section>
          ))}

          {hasNextPage ? (
            <Button
              variant="secondary"
              className="mt-4 w-full"
              loading={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              Показать ранние звонки
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Строка ленты: иконка на вертикальной линии, суть, время справа. */
function Rail({ children, marker }: { children: React.ReactNode; marker: React.ReactNode }) {
  return (
    <li className="group relative flex gap-3 pb-1">
      <div className="relative flex w-8 shrink-0 justify-center">
        <span
          className="absolute top-0 bottom-0 w-px bg-[var(--border)] group-first:top-4 group-last:bottom-auto group-last:h-4"
          aria-hidden
        />
        {marker}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function CallRow({ call, timezone }: { call: ActivityCall; timezone: string }) {
  const name = call.contact?.name;
  return (
    <Rail
      marker={
        <span
          className={cn(
            'relative mt-1.5 flex size-8 items-center justify-center rounded-full',
            call.credited
              ? 'bg-[var(--success-soft)] text-[var(--success)]'
              : 'bg-[var(--surface)] text-[var(--text-muted)]',
          )}
        >
          {call.credited ? (
            <Check className="size-4" aria-label="Засчитан" />
          ) : (
            <PhoneOutgoing className="size-3.5" aria-label="Не засчитан" />
          )}
        </span>
      }
    >
      <Link
        href={`/calls/${call.id}`}
        className="-mx-2 flex items-start gap-3 rounded-[10px] px-2 py-2 transition-colors duration-150 hover:bg-[var(--surface-2)]"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span
              className={cn(
                'truncate text-sm font-medium text-[var(--foreground)]',
                !name && 'numeric',
              )}
            >
              {name || formatPhone(call.toNumber)}
            </span>
            {name ? (
              <span className="numeric text-2xs shrink-0 text-[var(--text-muted)]">
                {formatPhone(call.toNumber)}
              </span>
            ) : null}
          </p>
          <p className="numeric text-2xs mt-0.5 text-[var(--text-secondary)]">{callFacts(call)}</p>
          {call.reason ? (
            <p className="text-2xs mt-0.5 text-[var(--text-muted)]">{call.reason}</p>
          ) : null}
          {call.summary ? (
            <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-[var(--text-secondary)]">
              {call.summary}
            </p>
          ) : null}
        </div>
        <time className="numeric text-2xs shrink-0 pt-0.5 text-[var(--text-muted)]">
          {formatInZone(call.startedAt, timezone, 'time').slice(0, 5)}
        </time>
      </Link>
    </Rail>
  );
}

function AuditRow({
  audit,
  subject,
  timezone,
}: {
  audit: Audit;
  subject: string | undefined;
  timezone: string;
}) {
  return (
    <Rail
      marker={
        <span className="relative mt-1.5 flex size-8 items-center justify-center">
          <span className="flex size-5 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-muted)]">
            <PenLine className="size-3" aria-hidden />
          </span>
        </span>
      }
    >
      <div className="text-2xs flex items-start gap-3 py-2.5 text-[var(--text-muted)]">
        <p className="min-w-0 flex-1">
          {audit.actor ? (
            <span className="text-[var(--text-secondary)]">{audit.actor.name} · </span>
          ) : null}
          {ru.auditActions[audit.action] ?? audit.action}
          {auditChange(audit)}
          {subject ? <span className="numeric"> · {subject}</span> : null}
        </p>
        <time className="numeric shrink-0">
          {formatInZone(audit.createdAt, timezone, 'time').slice(0, 5)}
        </time>
      </div>
    </Rail>
  );
}
