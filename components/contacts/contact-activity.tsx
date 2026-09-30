'use client';

import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileAudio,
  MessageSquareText,
  Phone,
  Star,
  Tag,
} from 'lucide-react';
import * as React from 'react';

import { AudioPlayer } from '@/components/calls/audio-player';
import { CallDrawer, CallEditors } from '@/components/calls/call-drawer';
import { CallStatusBadge, DirectionIcon, OutcomeBadge } from '@/components/calls/call-presentation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  EmptyState,
  TableSkeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/misc';
import { useContact, useContactAudit } from '@/lib/client/hooks';
import type {
  CallItem,
  ContactAuditResponse,
  ContactDetailsResponse,
  ContactHistoryView,
} from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatInZone } from '@/lib/time';
import { formatDuration } from '@/lib/utils';

const VIEWS = [
  { value: 'all', label: 'Звонки', icon: Phone, count: 'calls' },
  { value: 'recordings', label: 'Записи', icon: FileAudio, count: 'recordings' },
  { value: 'comments', label: 'Комментарии', icon: MessageSquareText, count: 'comments' },
  { value: 'tags', label: 'Метки', icon: Tag, count: 'taggedCalls' },
] as const;

export function ContactActivity({
  contactId,
  timezone,
  summary,
}: {
  contactId: string;
  timezone: string;
  summary: ContactDetailsResponse['summary'];
}) {
  const [view, setView] = React.useState<ContactHistoryView | 'audit'>('all');
  const [tag, setTag] = React.useState<string>();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const history = useContact(
    contactId,
    view === 'audit' ? 'all' : view,
    view === 'tags' ? tag : undefined,
  );
  const audit = useContactAudit(contactId, view === 'audit');
  const calls = history.data?.pages.flatMap((page) => page.calls) ?? [];
  const openEditor = (id: string) => {
    setExpandedId(null);
    setEditingId(id);
  };

  return (
    <div className="min-w-0 space-y-4">
      <Tabs
        value={view}
        onValueChange={(next) => {
          setView(next as typeof view);
          setExpandedId(null);
        }}
      >
        <div className="overflow-x-auto pb-2">
          <TabsList aria-label="Информация о клиенте" className="w-max min-w-full">
            {VIEWS.map(({ value, label, icon: Icon, count }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex flex-1 items-center gap-1.5 whitespace-nowrap"
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
                <span className="numeric text-2xs text-[var(--text-muted)]">{summary[count]}</span>
              </TabsTrigger>
            ))}
            <TabsTrigger
              value="audit"
              className="flex flex-1 items-center gap-1.5 whitespace-nowrap"
            >
              <ClipboardList className="size-3.5" aria-hidden />
              Аудит
            </TabsTrigger>
          </TabsList>
        </div>

        {VIEWS.map(({ value, label }) => (
          <TabsContent key={value} value={value}>
            {value === 'tags' && summary.tags.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2" aria-label="Фильтр по меткам">
                <Button
                  size="sm"
                  variant={!tag ? 'primary' : 'secondary'}
                  aria-pressed={!tag}
                  onClick={() => setTag(undefined)}
                >
                  Все метки
                </Button>
                {summary.tags.map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={tag === item ? 'primary' : 'secondary'}
                    aria-pressed={tag === item}
                    className="max-w-full"
                    onClick={() => setTag(item)}
                  >
                    <Tag aria-hidden />
                    <span className="truncate">{item}</span>
                  </Button>
                ))}
              </div>
            ) : null}
            <Card className="min-w-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                <h2 className="font-semibold">{label === 'Звонки' ? 'История общения' : label}</h2>
                {!history.isLoading ? (
                  <span className="text-xs text-[var(--text-muted)]">
                    {history.data?.pages[0]?.total ?? 0}
                  </span>
                ) : null}
              </div>
              {history.isLoading ? (
                <TableSkeleton rows={5} columns={3} />
              ) : history.isError ? (
                <EmptyState
                  title="Не удалось загрузить историю"
                  action={<Button onClick={() => void history.refetch()}>Повторить</Button>}
                />
              ) : calls.length === 0 ? (
                <EmptyState
                  title={value === 'all' ? 'Звонков пока нет' : 'Нет звонков в этом разделе'}
                  hint="Здесь отображается вся доступная вам история клиента."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {calls.map((call) => (
                    <ContactCall
                      key={call.id}
                      call={call}
                      timezone={timezone}
                      expanded={expandedId === call.id}
                      onToggle={() => setExpandedId(expandedId === call.id ? null : call.id)}
                      onEdit={() => openEditor(call.id)}
                    />
                  ))}
                </ul>
              )}
              {history.hasNextPage ? (
                <div className="border-t border-[var(--border)] p-4 text-center">
                  <Button
                    loading={history.isFetchingNextPage}
                    onClick={() => void history.fetchNextPage()}
                  >
                    Показать ещё
                  </Button>
                </div>
              ) : null}
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="audit">
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="font-semibold">История изменений</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Действия с клиентом и доступными вам звонками: кто, что и когда изменил.
              </p>
            </div>
            {audit.isLoading ? (
              <TableSkeleton rows={5} columns={3} />
            ) : audit.isError ? (
              <EmptyState
                title="Не удалось загрузить аудит"
                action={<Button onClick={() => void audit.refetch()}>Повторить</Button>}
              />
            ) : !audit.data?.pages[0]?.items.length ? (
              <EmptyState
                title="Изменений пока нет"
                hint="Изменения данных клиента, комментариев, результатов и меток появятся здесь."
              />
            ) : (
              <ol className="divide-y divide-[var(--border)]">
                {audit.data.pages
                  .flatMap((page) => page.items)
                  .map((event) => (
                    <li key={event.id} className="flex min-w-0 gap-3 px-5 py-4">
                      <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-muted)]">
                        <ClipboardList className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium">
                          {ru.auditActions[event.action] ?? event.action}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {event.actor?.name ?? 'Система'} ·{' '}
                          {formatInZone(event.createdAt, timezone, 'datetime')}
                        </p>
                        <AuditDetails event={event} />
                        {event.entityType === 'Call' && event.entityId ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto px-0"
                            onClick={() => openEditor(event.entityId!)}
                          >
                            Открыть звонок
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
              </ol>
            )}
            {audit.hasNextPage ? (
              <div className="border-t border-[var(--border)] p-4 text-center">
                <Button
                  loading={audit.isFetchingNextPage}
                  onClick={() => void audit.fetchNextPage()}
                >
                  Показать ещё
                </Button>
              </div>
            ) : null}
          </Card>
        </TabsContent>
      </Tabs>
      <CallDrawer callId={editingId} timezone={timezone} onClose={() => setEditingId(null)} />
    </div>
  );
}

function ContactCall({
  call,
  timezone,
  expanded,
  onToggle,
  onEdit,
}: {
  call: CallItem;
  timezone: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <li className={expanded ? 'bg-[var(--accent)]' : ''}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`recording-${call.id}`}
        className="flex w-full min-w-0 gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--surface)] sm:px-5"
      >
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]">
          <DirectionIcon direction={call.direction} status={call.status} />
        </span>
        <span className="min-w-0 flex-1 space-y-2">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium">
              {ru.callDirection[call.direction]} ·{' '}
              {formatInZone(call.startedAt, timezone, 'datetime')}
            </span>
            <span className="numeric text-xs text-[var(--text-muted)]">
              {formatDuration(call.durationSeconds)}
            </span>
            {call.isImportant ? (
              <Star
                className="size-3.5 text-[var(--price-margin-badge-text)]"
                aria-label="Важный звонок"
              />
            ) : null}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <CallStatusBadge status={call.status} />
            <OutcomeBadge outcome={call.outcome} />
            <span className="text-xs text-[var(--text-muted)]">
              {call.user?.name ?? 'Без менеджера'}
            </span>
            {call.recordingReady ? (
              <FileAudio
                className="size-3.5 text-[var(--brand)] dark:text-[var(--brand-text)]"
                aria-label="Есть запись"
              />
            ) : null}
          </span>
          {call.summary ? (
            <span className="block text-xs break-words whitespace-pre-wrap text-[var(--text-secondary)]">
              <span className="font-medium">Резюме: </span>
              {call.summary}
            </span>
          ) : null}
          {call.comment ? (
            <span className="block text-xs break-words whitespace-pre-wrap text-[var(--text-secondary)]">
              <span className="font-medium">Комментарий: </span>
              {call.comment}
            </span>
          ) : null}
          {call.tags.length ? (
            <span className="flex flex-wrap gap-1.5">
              {call.tags.map((tag) => (
                <Badge key={tag} tone="brand" className="max-w-full">
                  <Tag className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{tag}</span>
                </Badge>
              ))}
            </span>
          ) : null}
        </span>
        {expanded ? (
          <ChevronUp className="mt-1 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        ) : (
          <ChevronDown className="mt-1 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        )}
      </button>
      {expanded ? (
        <div id={`recording-${call.id}`} className="space-y-3 px-4 pb-4 sm:pr-5 sm:pl-16">
          {call.recordingReady ? (
            <AudioPlayer key={call.id} src={`/api/calls/${call.id}/recording`} />
          ) : (
            <p className="text-xs text-[var(--text-muted)]">Запись этого звонка недоступна.</p>
          )}
          {/* Итог, резюме, комментарий и метки правятся прямо здесь — без перехода */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <CallEditors call={call} />
          </div>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Таймлайн и транскрипция
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function AuditDetails({ event }: { event: ContactAuditResponse['items'][number] }) {
  const meta = event.meta;
  if (!meta) return null;
  const format = (value: unknown): string => {
    if (value == null || value === '') return 'Не указано';
    if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
    if (Array.isArray(value))
      return value.filter((item) => typeof item === 'string').join(', ') || 'Нет меток';
    if (typeof value !== 'string') return '—';
    if (event.action === 'call.outcome.update')
      return ru.callOutcome[value as keyof typeof ru.callOutcome] ?? value;
    if (event.action === 'call.result.update')
      return value === 'SUCCESS' ? 'Успешный' : value === 'FAILURE' ? 'Неуспешный' : value;
    return value;
  };
  const changes: Array<{ label?: string; from: unknown; to: unknown }> = [];
  if ('from' in meta || 'to' in meta) changes.push({ from: meta.from, to: meta.to });
  if (meta.changes && typeof meta.changes === 'object' && !Array.isArray(meta.changes)) {
    const labels: Record<string, string> = { name: 'Имя', company: 'Компания', note: 'Заметка' };
    for (const [key, value] of Object.entries(meta.changes)) {
      if (labels[key] && value && typeof value === 'object' && 'from' in value && 'to' in value)
        changes.push({ label: labels[key], from: value.from, to: value.to });
    }
  }
  if (!changes.length)
    return Array.isArray(meta.tags) ? (
      <p className="text-xs break-words text-[var(--text-secondary)]">Метки: {format(meta.tags)}</p>
    ) : null;
  return (
    <div className="space-y-2 pt-1 text-xs text-[var(--text-secondary)]">
      {changes.map((change, i) => (
        <div key={i} className="rounded-md bg-[var(--surface-2)] p-3">
          {change.label ? <p className="mb-1 font-medium">{change.label}</p> : null}
          <p className="break-words whitespace-pre-wrap">
            <span className="text-[var(--text-muted)]">Было: </span>
            {format(change.from)}
          </p>
          <p className="mt-1 break-words whitespace-pre-wrap">
            <span className="text-[var(--text-muted)]">Стало: </span>
            {format(change.to)}
          </p>
        </div>
      ))}
    </div>
  );
}
