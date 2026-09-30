'use client';

import type { CallOutcome } from '@prisma/client';
import { Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import {
  ANSWER_ONLY_OUTCOMES,
  DirectionIcon,
  externalNumber,
  OUTCOME_CHOICES,
  OUTCOME_RESULT,
} from '@/components/calls/call-presentation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { isNoConversation, MIN_TALK_SECONDS } from '@/lib/call-rules';
import { ApiRequestError } from '@/lib/client/api';
import { usePendingResults, useSubmitCallResult } from '@/lib/client/hooks';
import type { CallItem } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { cn, formatDurationWords } from '@/lib/utils';

/** «Позже» откладывает окно на 15 минут — дальше оно напомнит снова. */
const SNOOZE_MS = 15 * 60_000;

type Result = 'SUCCESS' | 'FAILURE';

/**
 * Короткое соединение почти всегда одно из трёх. Одна кнопка вместо формы:
 * иначе такие звонки размечают наугад, лишь бы закрыть окно.
 */
const QUICK_OUTCOMES: CallOutcome[] = ['VOICEMAIL', 'HUNG_UP', 'WRONG_NUMBER'];

/** Разговора по сути не было — описывать нечего. */
const NO_SUMMARY: CallOutcome[] = ['VOICEMAIL', 'HUNG_UP', 'WRONG_NUMBER'];

type CallResultContextValue = {
  pendingCount: number;
  openPending: () => void;
};

const CallResultContext = React.createContext<CallResultContextValue>({
  pendingCount: 0,
  openPending: () => undefined,
});

export function useCallResults(): CallResultContextValue {
  return React.useContext(CallResultContext);
}

/**
 * Окно итога звонка. Бэкенд помечает завершённый звонок как требующий
 * разметки, realtime обновляет список — и окно всплывает само. Менеджеру
 * не нужно искать звонок в журнале.
 */
export function CallResultProvider({
  timezone,
  children,
}: {
  timezone: string;
  children: React.ReactNode;
}) {
  const { data } = usePendingResults();
  const [snoozed, setSnoozed] = React.useState<Map<string, number>>(() => new Map());
  const [forced, setForced] = React.useState(false);
  const [done, setDone] = React.useState<Set<string>>(() => new Set());
  const [now, setNow] = React.useState(() => Date.now());

  // Отложенные звонки возвращаются сами, без перезагрузки страницы
  React.useEffect(() => {
    if (snoozed.size === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [snoozed.size]);

  // Сохранённый звонок уходит из очереди сразу, не дожидаясь перезапроса
  const pending = React.useMemo(
    () => (data?.items ?? []).filter((call) => !done.has(call.id)),
    [data?.items, done],
  );
  const queue = forced ? pending : pending.filter((call) => (snoozed.get(call.id) ?? 0) <= now);
  const current = queue[0] ?? null;

  React.useEffect(() => {
    if (queue.length === 0 && forced) setForced(false);
  }, [queue.length, forced]);

  const snoozeAll = () => {
    const until = Date.now() + SNOOZE_MS;
    setSnoozed((prev) => {
      const next = new Map(prev);
      for (const call of pending) next.set(call.id, until);
      return next;
    });
    setForced(false);
  };

  const value = React.useMemo<CallResultContextValue>(
    () => ({
      pendingCount: Math.max(0, (data?.total ?? 0) - done.size),
      openPending: () => {
        setNow(Date.now());
        setForced(true);
      },
    }),
    [data?.total, done.size],
  );

  return (
    <CallResultContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(current)} onOpenChange={(open) => !open && snoozeAll()}>
        <DialogContent className="max-w-lg" onOpenAutoFocus={(event) => event.preventDefault()}>
          {current ? (
            <ResultForm
              key={current.id}
              call={current}
              remaining={Math.max(0, queue.length - 1)}
              timezone={timezone}
              onLater={snoozeAll}
              onSaved={() => setDone((prev) => new Set(prev).add(current.id))}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </CallResultContext.Provider>
  );
}

function ResultForm({
  call,
  remaining,
  timezone,
  onLater,
  onSaved,
}: {
  call: CallItem;
  remaining: number;
  timezone: string;
  onLater: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmitCallResult();
  const talked = call.status === 'COMPLETED';

  // Неотвеченный исходящий почти всегда неуспешен — экономим менеджеру клик
  const [result, setResult] = React.useState<Result | null>(talked ? null : 'FAILURE');
  const [outcome, setOutcome] = React.useState<CallOutcome | null>(null);
  const [summary, setSummary] = React.useState(call.summary ?? call.comment ?? '');
  const [important, setImportant] = React.useState(call.isImportant);
  const [attempted, setAttempted] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Фокус — на само окно, а не на первую кнопку: иначе рамка фокуса на
  // «Успешный» выглядит как выбор. Горячие клавиши при этом работают сразу
  React.useEffect(() => {
    rootRef.current?.focus();
  }, []);
  const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({});

  const number = externalNumber(call);

  // Ошибки считаются от текущих значений: исправил поле — подсказка ушла сама
  const localErrors: Record<string, string> = {};
  if (!result) localErrors.result = 'Отметьте, успешный звонок или нет';
  if (talked && !outcome) localErrors.outcome = 'Укажите, с кем удалось соединиться';
  if (isNoConversation(outcome) && result === 'SUCCESS')
    localErrors.result = ru.callResult.voicemailHint;
  const summaryRequired = talked && !(outcome && NO_SUMMARY.includes(outcome));
  if (summaryRequired && summary.trim().length < 3)
    localErrors.summary = ru.callResult.summaryRequired;
  const short = talked && call.durationSeconds < MIN_TALK_SECONDS;
  const errors = attempted ? { ...serverErrors, ...localErrors } : serverErrors;

  const pickOutcome = (value: CallOutcome) => {
    const next = outcome === value ? null : value;
    setOutcome(next);
    const suggested = next ? OUTCOME_RESULT[next] : undefined;
    if (suggested) setResult(suggested);
  };

  const hasLocalErrors = Object.keys(localErrors).length > 0;

  const send = React.useCallback(
    (value: Result, chosen: CallOutcome | null) => {
      setServerErrors({});
      submit.mutate(
        {
          id: call.id,
          result: value,
          ...(chosen ? { outcome: chosen } : {}),
          ...(summary.trim() ? { summary: summary.trim() } : {}),
          isImportant: important,
        },
        {
          onSuccess: () => {
            toast.success(ru.callResult.saved);
            onSaved();
          },
          onError: (error) => {
            if (error instanceof ApiRequestError && error.fields) setServerErrors(error.fields);
            else toast.error(error instanceof Error ? error.message : ru.errors.saveFailed);
          },
        },
      );
    },
    [call.id, important, onSaved, submit, summary],
  );

  const save = React.useCallback(() => {
    setAttempted(true);
    if (!result || hasLocalErrors) return;
    send(result, outcome);
  }, [hasLocalErrors, outcome, result, send]);

  const saveQuick = (value: CallOutcome) => {
    setOutcome(value);
    setResult('FAILURE');
    send('FAILURE', value);
  };

  // 1 / 2 — итог, Ctrl+Enter — сохранить. В поле резюме цифры печатаются как обычно
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      save();
      return;
    }
    const typing = (event.target as HTMLElement).tagName === 'TEXTAREA';
    if (typing) return;
    if (event.key === '1') setResult('SUCCESS');
    if (event.key === '2') setResult('FAILURE');
  };

  return (
    <div ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown} className="outline-none">
      <DialogHeader>
        <DialogTitle>{ru.callResult.title}</DialogTitle>
        <DialogDescription>
          {remaining > 0 ? ru.callResult.remaining(remaining) : null}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface)]">
            <DirectionIcon direction={call.direction} status={call.status} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="numeric truncate text-sm font-semibold text-[var(--foreground)]">
              {call.contact?.name || formatPhone(number)}
            </p>
            <p className="numeric text-2xs truncate text-[var(--text-muted)]">
              {call.contact?.name ? `${formatPhone(number)} · ` : ''}
              {ru.callDirection[call.direction]} · {formatInZone(call.startedAt, timezone, 'short')}
              {call.durationSeconds > 0 ? ` · ${formatDurationWords(call.durationSeconds)}` : ''}
            </p>
          </div>
        </div>

        {short ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              {ru.callResult.quickTitle(call.durationSeconds)}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_OUTCOMES.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="secondary"
                  disabled={submit.isPending}
                  onClick={() => saveQuick(value)}
                  className="h-11"
                >
                  {ru.callOutcome[value]}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            {ru.callResult.outcome}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOME_CHOICES.filter(
              (value) =>
                (talked || !ANSWER_ONLY_OUTCOMES.includes(value)) &&
                // Короткому звонку эти исходы уже предложены кнопками выше
                !(short && QUICK_OUTCOMES.includes(value)),
            ).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={outcome === value}
                onClick={() => pickOutcome(value)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs transition-colors duration-150 max-md:h-10',
                  outcome === value
                    ? 'border-transparent bg-[var(--brand-soft)] font-medium text-[var(--brand)] dark:text-[var(--brand-text)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]',
                )}
              >
                {ru.callOutcome[value]}
              </button>
            ))}
          </div>
          {errors.outcome ? (
            <p role="alert" className="text-2xs text-[var(--destructive)]">
              {errors.outcome}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <div
            className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface)] p-1"
            role="radiogroup"
            aria-label={ru.callResult.title}
          >
            <ResultButton
              active={result === 'SUCCESS'}
              tone="success"
              icon={<ThumbsUp className="size-4" aria-hidden />}
              label={ru.callResult.success}
              shortcut="1"
              disabled={isNoConversation(outcome)}
              onClick={() => setResult('SUCCESS')}
            />
            <ResultButton
              active={result === 'FAILURE'}
              tone="danger"
              icon={<ThumbsDown className="size-4" aria-hidden />}
              label={ru.callResult.failure}
              shortcut="2"
              onClick={() => setResult('FAILURE')}
            />
          </div>
          {errors.result ? (
            <p role="alert" className="text-2xs text-[var(--destructive)]">
              {errors.result}
            </p>
          ) : null}
        </div>

        <Field
          label={ru.callResult.summary}
          htmlFor="call-summary"
          required={summaryRequired}
          error={errors.summary}
        >
          <Textarea
            id="call-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={ru.callResult.summaryPlaceholder}
            aria-invalid={Boolean(errors.summary)}
            className="min-h-24"
            maxLength={4000}
          />
        </Field>

        <button
          type="button"
          role="switch"
          aria-checked={important}
          onClick={() => setImportant((v) => !v)}
          className={cn(
            'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
            important
              ? 'border-[var(--price-margin-badge-text)]/40 bg-[var(--price-margin-badge-bg)]'
              : 'border-[var(--border)] hover:border-[var(--border-strong)]',
          )}
        >
          <Star
            className={cn(
              'size-5 shrink-0 transition-transform',
              important
                ? 'scale-110 fill-current text-[var(--price-margin-badge-text)]'
                : 'text-[var(--text-muted)]',
            )}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-[var(--foreground)]">
              {ru.callResult.important}
            </span>
          </span>
        </button>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onLater}>
          {ru.callResult.later}
        </Button>
        <Button type="button" variant="primary" loading={submit.isPending} onClick={save}>
          {ru.callResult.save}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ResultButton({
  active,
  tone,
  icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  active: boolean;
  tone: 'success' | 'danger';
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const color = tone === 'success' ? 'var(--success)' : 'var(--destructive)';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[background-color,color,box-shadow] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'shadow-soft bg-[var(--card)]'
          : 'text-[var(--text-muted)] enabled:hover:text-[var(--foreground)]',
      )}
      style={active ? { color } : undefined}
    >
      {icon}
      {label}
      <kbd className="text-2xs absolute right-2.5 hidden rounded border border-[var(--border)] px-1.5 font-normal text-[var(--text-muted)] md:block">
        {shortcut}
      </kbd>
    </button>
  );
}
