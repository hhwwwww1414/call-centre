'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { CallOutcome } from '@prisma/client';
import { Check, FileAudio, Sparkles, Star, Tag, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { AudioPlayer } from '@/components/calls/audio-player';
import { CallButton } from '@/components/calls/call-button';
import {
  CallStatusBadge,
  DirectionIcon,
  externalNumber,
  OUTCOME_OPTIONS,
  OutcomeBadge,
} from '@/components/calls/call-presentation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/field';
import { EmptyState, Separator, Skeleton } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCall, useUpdateCall } from '@/lib/client/hooks';
import type { CallHistoryItem } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { cn, formatDuration, formatDurationWords } from '@/lib/utils';

export function CallDrawer({
  callId,
  timezone,
  onClose,
}: {
  callId: string | null;
  timezone: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(callId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <DialogPrimitive.Title className="sr-only">{ru.calls.detailsTitle}</DialogPrimitive.Title>
        {callId ? <DrawerBody callId={callId} timezone={timezone} onClose={onClose} /> : null}
      </SheetContent>
    </Dialog>
  );
}

function DrawerBody({
  callId,
  timezone,
  onClose,
}: {
  callId: string;
  timezone: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useCall(callId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center p-5">
        <EmptyState title={ru.calls.notFound} hint={ru.calls.notFoundHint} />
      </div>
    );
  }

  const { call, history } = data;
  const number = externalNumber(call);

  return (
    <>
      <header className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
        <DirectionIcon direction={call.direction} status={call.status} className="mt-1 size-5" />

        <div className="min-w-0 flex-1">
          <p className="numeric truncate text-base font-semibold text-[var(--foreground)]">
            {formatPhone(number)}
          </p>
          {call.contact?.name || call.contact?.company ? (
            <p className="truncate text-xs text-[var(--text-muted)]">
              {[call.contact?.name, call.contact?.company].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <CallStatusBadge status={call.status} />
            <Badge tone="outline">{ru.callDirection[call.direction]}</Badge>
            {call.durationSeconds > 0 ? (
              <span className="numeric text-2xs text-[var(--text-secondary)]">
                {formatDurationWords(call.durationSeconds)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <CallButton phone={number} />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={ru.common.close}>
            <X aria-hidden />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-5">
          <Timeline call={call} timezone={timezone} />

          <section>
            <h3 className="mb-2 text-xs font-semibold text-[var(--foreground)]">
              {ru.calls.recording}
            </h3>
            {call.recordingReady && call.recordingUrl ? (
              <AudioPlayer src={call.recordingUrl} />
            ) : (
              <p className="rounded-lg bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)]">
                {ru.calls.recordingMissing}. {ru.calls.recordingMissingHint}
              </p>
            )}
          </section>

          <TranscriptSection />

          <Separator />

          <CallEditors call={call} />

          <Separator />

          <ContactHistory
            history={history}
            timezone={timezone}
            contactId={call.contact?.id ?? null}
          />

          <dl className="text-2xs grid grid-cols-2 gap-2 rounded-lg bg-[var(--surface-2)] p-3">
            <div>
              <dt className="text-[var(--text-muted)]">{ru.calls.provider}</dt>
              <dd className="text-[var(--text-secondary)]">{call.provider}</dd>
            </div>
            {call.externalId ? (
              <div className="min-w-0">
                <dt className="text-[var(--text-muted)]">{ru.calls.externalId}</dt>
                <dd className="numeric truncate text-[var(--text-secondary)]">{call.externalId}</dd>
              </div>
            ) : null}
            {call.user ? (
              <div>
                <dt className="text-[var(--text-muted)]">{ru.calls.columnManager}</dt>
                <dd className="text-[var(--text-secondary)]">{call.user.name}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </>
  );
}

function Timeline({
  call,
  timezone,
}: {
  call: {
    startedAt: string;
    answeredAt: string | null;
    endedAt: string | null;
    waitSeconds: number | null;
  };
  timezone: string;
}) {
  const steps = [
    { label: ru.calls.timelineStarted, at: call.startedAt, tone: 'var(--text-muted)' },
    {
      label: call.answeredAt ? ru.calls.timelineAnswered : ru.calls.timelineNoAnswer,
      at: call.answeredAt,
      tone: call.answeredAt ? 'var(--success)' : 'var(--destructive)',
    },
    { label: ru.calls.timelineEnded, at: call.endedAt, tone: 'var(--text-muted)' },
  ];

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-[var(--foreground)]">{ru.calls.timeline}</h3>
      <ol className="flex flex-col gap-0">
        {steps.map((step, index) => (
          <li key={step.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: step.at ? step.tone : 'var(--border-strong)' }}
                aria-hidden
              />
              {index < steps.length - 1 ? (
                <span className="w-px flex-1 bg-[var(--border)]" aria-hidden />
              ) : null}
            </div>
            <div className="flex flex-1 items-baseline justify-between gap-3 pb-3">
              <span className="text-xs text-[var(--text-secondary)]">{step.label}</span>
              <span className="numeric text-2xs text-[var(--text-muted)]">
                {step.at ? formatInZone(step.at, timezone, 'time') : '—'}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {call.waitSeconds != null ? (
        <p className="text-2xs text-[var(--text-muted)]">
          {ru.calls.columnWait}: <span className="numeric">{call.waitSeconds} с</span>
        </p>
      ) : null}
    </section>
  );
}

/** Место под транскрибацию заложено, состояние — честное «недоступно» (ТЗ 5.4). */
function TranscriptSection() {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
        <Sparkles className="size-3.5 text-[var(--text-muted)]" aria-hidden />
        {ru.calls.transcript}
      </h3>
      <div className="rounded-lg border border-dashed border-[var(--border-strong)] p-4">
        <p className="text-xs text-[var(--text-secondary)]">{ru.calls.transcriptUnavailable}</p>
        <p className="text-2xs mt-1 text-[var(--text-muted)]">{ru.calls.transcriptHint}</p>
        <div className="mt-3 flex flex-col gap-2 opacity-40" aria-hidden>
          {[0, 1].map((index) => (
            <div key={index} className="flex gap-2">
              <FileAudio className="mt-0.5 size-3 shrink-0 text-[var(--text-muted)]" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-2 w-16" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Всё, что менеджер правит в звонке: итог, резюме, результат, комментарий,
 * метки. Общий блок для боковой карточки звонка и карточки клиента.
 */
export function CallEditors({
  call,
}: {
  call: {
    id: string;
    result: 'SUCCESS' | 'FAILURE' | null;
    isImportant: boolean;
    summary: string | null;
    outcome: CallOutcome;
    comment: string | null;
    tags: string[];
  };
}) {
  const callId = call.id;
  const update = useUpdateCall(callId);
  return (
    <div className="flex flex-col gap-5">
      <ResultEditor
        result={call.result}
        important={call.isImportant}
        onChange={(input) =>
          update.mutate(input, {
            onError: () =>
              toast.error(ru.errors.saveFailed, { description: ru.errors.saveFailedHint }),
          })
        }
      />

      <CommentEditor
        callId={call.id}
        id="call-summary-edit"
        label={ru.callResult.summary}
        placeholder={ru.callResult.summaryPlaceholder}
        initial={call.summary ?? ''}
        onSave={(summary) =>
          update.mutateAsync({ summary }).catch(() => {
            toast.error(ru.errors.saveFailed, { description: ru.errors.saveFailedHint });
          })
        }
      />

      <OutcomeEditor
        value={call.outcome}
        onChange={(outcome) => {
          update.mutate(
            { outcome },
            {
              onError: () =>
                toast.error(ru.errors.saveFailed, { description: ru.errors.saveFailedHint }),
            },
          );
        }}
        saving={update.isPending}
      />

      <CommentEditor
        callId={call.id}
        initial={call.comment ?? ''}
        onSave={(comment) =>
          update.mutateAsync({ comment }).catch(() => {
            toast.error(ru.errors.saveFailed, { description: ru.errors.saveFailedHint });
          })
        }
      />

      <TagsEditor
        tags={call.tags}
        onChange={(tags) => {
          update.mutate(
            { tags },
            {
              onError: () =>
                toast.error(ru.errors.saveFailed, { description: ru.errors.saveFailedHint }),
            },
          );
        }}
      />
    </div>
  );
}

/** Итог и «важный» — те же отметки, что во всплывающем окне, но с правкой задним числом. */
function ResultEditor({
  result,
  important,
  onChange,
}: {
  result: 'SUCCESS' | 'FAILURE' | null;
  important: boolean;
  onChange: (input: { result?: 'SUCCESS' | 'FAILURE' | null; isImportant?: boolean }) => void;
}) {
  const options = [
    {
      value: 'SUCCESS' as const,
      label: ru.callResult.SUCCESS,
      icon: ThumbsUp,
      color: 'var(--success)',
      soft: 'var(--success-soft)',
    },
    {
      value: 'FAILURE' as const,
      label: ru.callResult.FAILURE,
      icon: ThumbsDown,
      color: 'var(--destructive)',
      soft: 'var(--destructive-soft)',
    },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{ru.callResult.title}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {options.map((option) => {
          const active = result === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ result: active ? null : option.value })}
              className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors max-md:h-11"
              style={
                active
                  ? { borderColor: option.color, backgroundColor: option.soft, color: option.color }
                  : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
              }
            >
              <Icon className="size-4" aria-hidden />
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={important}
          onClick={() => onChange({ isImportant: !important })}
          className={cn(
            'ml-auto flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors max-md:h-11',
            important
              ? 'border-transparent bg-[var(--price-margin-badge-bg)] text-[var(--price-margin-badge-text)]'
              : 'border-[var(--border)] text-[var(--text-secondary)]',
          )}
        >
          <Star className={cn('size-4', important && 'fill-current')} aria-hidden />
          {ru.callResult.important}
        </button>
      </div>
    </div>
  );
}

function OutcomeEditor({
  value,
  onChange,
  saving,
}: {
  value: CallOutcome;
  onChange: (outcome: CallOutcome) => void;
  saving: boolean;
}) {
  return (
    <Field label={ru.calls.outcome} htmlFor="call-outcome">
      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={(next) => onChange(next as CallOutcome)}>
          <SelectTrigger id="call-outcome" className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {saving ? (
          <span className="text-2xs text-[var(--text-muted)]">{ru.common.saving}</span>
        ) : null}
      </div>
    </Field>
  );
}

/** Автосохранение комментария: пишем через паузу после последнего ввода. */
function CommentEditor({
  callId,
  initial,
  onSave,
  id = 'call-comment',
  label = ru.calls.comment,
  placeholder = ru.calls.commentPlaceholder,
}: {
  callId: string;
  initial: string;
  onSave: (comment: string) => Promise<unknown>;
  id?: string;
  label?: string;
  placeholder?: string;
}) {
  const [value, setValue] = React.useState(initial);
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const savedRef = React.useRef(initial);

  React.useEffect(() => {
    setValue(initial);
    savedRef.current = initial;
    setStatus('idle');
  }, [initial, callId]);

  React.useEffect(() => {
    if (value === savedRef.current) return;
    const timer = setTimeout(async () => {
      setStatus('saving');
      await onSave(value);
      savedRef.current = value;
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    }, 900);
    return () => clearTimeout(timer);
  }, [value, onSave]);

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        status === 'saving'
          ? ru.common.saving
          : status === 'saved'
            ? ru.common.saved
            : ru.calls.commentAutosave
      }
    >
      <Textarea
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        maxLength={4000}
      />
    </Field>
  );
}

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = React.useState('');

  const add = () => {
    const value = draft.trim();
    if (!value || tags.includes(value) || tags.length >= 12) {
      setDraft('');
      return;
    }
    onChange([...tags, value]);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="call-tags">{ru.calls.tags}</Label>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <Badge tone="outline" className="gap-1 pr-1">
                <Tag className="size-3" aria-hidden />
                {tag}
                <button
                  type="button"
                  onClick={() => onChange(tags.filter((t) => t !== tag))}
                  className="rounded-full p-0.5 hover:bg-[var(--surface)]"
                  aria-label={`Убрать тег ${tag}`}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id="call-tags"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder={ru.calls.tagsPlaceholder}
        />
        <Button variant="secondary" size="icon" onClick={add} aria-label="Добавить тег">
          <Check aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function ContactHistory({
  history,
  timezone,
  contactId,
}: {
  history: CallHistoryItem[];
  timezone: string;
  contactId: string | null;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-[var(--foreground)]">
          {ru.calls.contactHistory}
        </h3>
        {contactId ? (
          <Link
            href={`/contacts/${contactId}`}
            className="text-2xs text-[var(--brand)] hover:underline dark:text-[var(--brand-text)]"
          >
            {ru.contacts.history}
          </Link>
        ) : null}
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{ru.calls.contactHistoryEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {history.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-2">
              <DirectionIcon direction={item.direction} status={item.status} />
              <span className="numeric text-2xs flex-1 text-[var(--text-secondary)]">
                {formatInZone(item.startedAt, timezone, 'datetime')}
              </span>
              <span className="numeric text-2xs text-[var(--text-muted)]">
                {item.durationSeconds > 0 ? formatDuration(item.durationSeconds) : '—'}
              </span>
              <OutcomeBadge outcome={item.outcome} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
