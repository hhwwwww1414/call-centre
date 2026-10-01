'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { CallOutcome, CallStatus } from '@prisma/client';
import { Star, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { AudioPlayer } from '@/components/calls/audio-player';
import { CallButton } from '@/components/calls/call-button';
import {
  ANSWER_ONLY_OUTCOMES,
  CallVerdict,
  DirectionIcon,
  externalNumber,
  OUTCOME_CHOICES,
  OUTCOME_RESULT,
} from '@/components/calls/call-presentation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { isNoConversation } from '@/lib/call-rules';
import { useCall, useUpdateCall, useUpdateContact } from '@/lib/client/hooks';
import type { CallHistoryItem } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { cn, formatDuration } from '@/lib/utils';

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
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
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
  const contact = call.contact;
  const name = contact?.name;
  const meta = [
    ru.callDirection[call.direction],
    formatInZone(call.startedAt, timezone, 'short'),
    call.status === 'COMPLETED'
      ? call.durationSeconds > 0
        ? formatDuration(call.durationSeconds)
        : null
      : ru.callStatus[call.status],
    call.user?.name,
  ].filter(Boolean);

  return (
    <>
      <header className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface)]">
          <DirectionIcon direction={call.direction} status={call.status} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold tracking-tight text-[var(--foreground)]">
            {name || <span className="text-[var(--text-muted)]">Без имени</span>}
          </p>
          {/* Номер виден всегда, даже когда клиент подписан */}
          <p className="numeric mt-0.5 truncate text-sm text-[var(--text-secondary)]">
            {formatPhone(number)}
            {contact?.company ? (
              <span className="text-[var(--text-muted)]"> · {contact.company}</span>
            ) : null}
          </p>
          <p className="numeric text-2xs mt-1 truncate text-[var(--text-muted)]">
            {meta.join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CallButton phone={number} />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={ru.common.close}>
            <X aria-hidden />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-6">
          {contact ? <ContactFields contact={contact} /> : null}
          {call.recordingReady ? <AudioPlayer src={`/api/calls/${call.id}/recording`} /> : null}
          <CallEditors call={call} />
          <ContactHistory
            history={history}
            timezone={timezone}
            contactId={call.contact?.id ?? null}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Всё, что менеджер правит в звонке: исход, результат, резюме, комментарий,
 * метки. Общий блок для боковой карточки звонка и карточки клиента.
 */
export function CallEditors({
  call,
}: {
  call: {
    id: string;
    status: CallStatus;
    result: 'SUCCESS' | 'FAILURE' | null;
    isImportant: boolean;
    summary: string | null;
    outcome: CallOutcome;
    comment: string | null;
    tags: string[];
  };
}) {
  const update = useUpdateCall(call.id);
  const answered = call.status === 'COMPLETED';
  const save = (input: Parameters<typeof update.mutate>[0]) =>
    update.mutate(input, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : ru.errors.saveFailed),
    });

  const pickOutcome = (outcome: CallOutcome) => {
    if (outcome === call.outcome) return;
    // Исход подсказывает результат, пока менеджер не выбрал его сам
    const suggested = OUTCOME_RESULT[outcome];
    const forced = isNoConversation(outcome) ? 'FAILURE' : null;
    const result = forced ?? (call.result ? undefined : suggested);
    save(result ? { outcome, result } : { outcome });
  };

  // У звонка с ответом сначала исход — иначе «успешный» ничем не подтверждён
  const resultLocked = answered && call.outcome === 'NEW';

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <SectionLabel>{ru.callResult.outcome}</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOME_CHOICES.filter((value) => answered || !ANSWER_ONLY_OUTCOMES.includes(value)).map(
            (value) => (
              <button
                key={value}
                type="button"
                aria-pressed={call.outcome === value}
                onClick={() => pickOutcome(value)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs transition-colors duration-150 max-md:h-10',
                  call.outcome === value
                    ? 'border-transparent bg-[var(--brand-soft)] font-medium text-[var(--brand)] dark:text-[var(--brand-text)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]',
                )}
              >
                {ru.callOutcome[value]}
              </button>
            ),
          )}
        </div>
      </section>

      <div className="flex items-center gap-2">
        <div
          role="radiogroup"
          aria-label={ru.callResult.title}
          className="inline-flex rounded-[10px] bg-[var(--surface)] p-0.5"
        >
          {(['SUCCESS', 'FAILURE'] as const).map((value) => {
            const active = call.result === value;
            const Icon = value === 'SUCCESS' ? ThumbsUp : ThumbsDown;
            const disabled =
              resultLocked || (value === 'SUCCESS' && isNoConversation(call.outcome));
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => save({ result: active ? null : value })}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors duration-150 max-md:h-10',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  active
                    ? 'shadow-soft bg-[var(--card)]'
                    : 'text-[var(--text-muted)] enabled:hover:text-[var(--foreground)]',
                  active &&
                    (value === 'SUCCESS' ? 'text-[var(--success)]' : 'text-[var(--destructive)]'),
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {ru.callResult[value]}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={call.isImportant}
          onClick={() => save({ isImportant: !call.isImportant })}
          aria-label={ru.callResult.important}
          title={ru.callResult.important}
          className={cn(
            'ml-auto flex size-9 items-center justify-center rounded-[10px] transition-colors duration-150',
            call.isImportant
              ? 'bg-[var(--price-margin-badge-bg)] text-[var(--price-margin-badge-text)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]',
          )}
        >
          <Star className={cn('size-4', call.isImportant && 'fill-current')} aria-hidden />
        </button>
      </div>

      <TextEditor
        callId={call.id}
        id="call-summary-edit"
        label={ru.callResult.summary}
        placeholder={ru.callResult.summaryPlaceholder}
        initial={call.summary ?? ''}
        onSave={(summary) => update.mutateAsync({ summary })}
      />

      <TextEditor
        callId={call.id}
        id="call-comment"
        label={ru.calls.comment}
        placeholder={ru.calls.commentPlaceholder}
        initial={call.comment ?? ''}
        rows={2}
        onSave={(comment) => update.mutateAsync({ comment })}
      />

      <TagsEditor tags={call.tags} onChange={(tags) => save({ tags })} />
    </div>
  );
}

function SectionLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{children}</span>
      {aside}
    </div>
  );
}

/** Поле с автосохранением: пишем через паузу после последнего ввода. */
function TextEditor({
  callId,
  id,
  label,
  placeholder,
  initial,
  rows = 3,
  onSave,
}: {
  callId: string;
  id: string;
  label: string;
  placeholder: string;
  initial: string;
  rows?: number;
  onSave: (value: string) => Promise<unknown>;
}) {
  const [value, setValue] = React.useState(initial);
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
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
      try {
        await onSave(value);
        savedRef.current = value;
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 1500);
      } catch {
        setStatus('error');
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [value, onSave]);

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel
        aside={
          status === 'idle' ? null : (
            <span
              className={cn(
                'text-2xs',
                status === 'error' ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)]',
              )}
              aria-live="polite"
            >
              {status === 'saving'
                ? ru.common.saving
                : status === 'saved'
                  ? ru.common.saved
                  : ru.errors.saveFailed}
            </span>
          )
        }
      >
        <label htmlFor={id}>{label}</label>
      </SectionLabel>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="min-h-0"
        maxLength={4000}
      />
    </div>
  );
}

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = React.useState('');

  const add = () => {
    const value = draft.trim();
    setDraft('');
    if (!value || tags.includes(value) || tags.length >= 12) return;
    onChange([...tags, value]);
  };

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>
        <label htmlFor="call-tags">{ru.calls.tags}</label>
      </SectionLabel>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[10px] border border-[var(--input)] bg-[var(--card)] px-2 py-1.5 transition-colors focus-within:border-[var(--ring)]">
        {tags.map((tag) => (
          <Badge key={tag} tone="brand" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="rounded-full p-0.5 hover:bg-[var(--brand-soft)]"
              aria-label={`Убрать тег ${tag}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        ))}
        <input
          id="call-tags"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
            if (event.key === 'Backspace' && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          placeholder={tags.length ? '' : ru.calls.tagsPlaceholder}
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-xs text-[var(--foreground)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </div>
    </div>
  );
}

/**
 * Кто на том конце: имя, компания, заметка. Менеджер дополняет их прямо
 * из звонка — сохраняем, когда он уходит с поля.
 */
function ContactFields({
  contact,
}: {
  contact: {
    id: string;
    name: string | null;
    company: string | null;
    note: string | null;
    owner: { id: string; name: string } | null;
  };
}) {
  const update = useUpdateContact(contact.id);
  const save = (field: 'name' | 'company' | 'note', value: string) => {
    if ((contact[field] ?? '') === value.trim()) return;
    update.mutate(
      { [field]: value.trim() || null },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : ru.errors.saveFailed),
      },
    );
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel
        aside={
          <span className="flex items-center gap-3">
            {update.isPending ? (
              <span className="text-2xs text-[var(--text-muted)]">{ru.common.saving}</span>
            ) : null}
            <Link
              href={`/contacts/${contact.id}`}
              className="text-2xs font-medium text-[var(--brand)] hover:underline dark:text-[var(--brand-text)]"
            >
              Карточка клиента
            </Link>
          </span>
        }
      >
        Клиент
        {contact.owner ? (
          <span className="font-normal text-[var(--text-muted)]"> · {contact.owner.name}</span>
        ) : null}
      </SectionLabel>
      <div className="grid gap-2 sm:grid-cols-2">
        <InlineField
          key={`name-${contact.id}-${contact.name ?? ''}`}
          label="Имя или ФИО"
          initial={contact.name ?? ''}
          maxLength={120}
          onCommit={(value) => save('name', value)}
        />
        <InlineField
          key={`company-${contact.id}-${contact.company ?? ''}`}
          label={ru.contacts.company}
          initial={contact.company ?? ''}
          maxLength={120}
          onCommit={(value) => save('company', value)}
        />
      </div>
      <InlineField
        key={`note-${contact.id}-${contact.note ?? ''}`}
        label="О клиенте"
        initial={contact.note ?? ''}
        maxLength={2000}
        multiline
        onCommit={(value) => save('note', value)}
      />
    </section>
  );
}

function InlineField({
  label,
  initial,
  maxLength,
  multiline,
  onCommit,
}: {
  label: string;
  initial: string;
  maxLength: number;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = React.useState(initial);
  const className =
    'w-full rounded-[10px] border border-[var(--input)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] transition-[border-color,box-shadow] duration-150 focus:border-[var(--ring)] focus:ring-4 focus:ring-[var(--brand-soft)] focus:outline-none';
  const field = multiline ? (
    <textarea
      aria-label={label}
      value={value}
      rows={2}
      maxLength={maxLength}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      className={cn(className, 'resize-none py-2 leading-relaxed')}
    />
  ) : (
    <input
      aria-label={label}
      value={value}
      maxLength={maxLength}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={cn(className, 'h-10')}
    />
  );
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs text-[var(--text-muted)]">{label}</span>
      {field}
    </label>
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
  if (history.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel
        aside={
          contactId ? (
            <Link
              href={`/contacts/${contactId}`}
              className="text-2xs font-medium text-[var(--brand)] hover:underline dark:text-[var(--brand-text)]"
            >
              {ru.contacts.history}
            </Link>
          ) : null
        }
      >
        {ru.calls.contactHistory}
      </SectionLabel>
      <ul className="flex flex-col">
        {history.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 border-b border-[var(--border)] py-2.5 last:border-b-0"
          >
            <DirectionIcon direction={item.direction} status={item.status} />
            <span className="numeric text-2xs flex-1 text-[var(--text-secondary)]">
              {formatInZone(item.startedAt, timezone, 'short')}
              {item.durationSeconds > 0 ? (
                <span className="text-[var(--text-muted)]">
                  {' '}
                  · {formatDuration(item.durationSeconds)}
                </span>
              ) : null}
            </span>
            <CallVerdict status={item.status} outcome={item.outcome} result={item.result} />
          </li>
        ))}
      </ul>
    </section>
  );
}
