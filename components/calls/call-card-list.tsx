'use client';

import { MessageSquareText, Phone, Play } from 'lucide-react';

import {
  CallStatusBadge,
  DirectionIcon,
  externalNumber,
  ImportantStar,
  OutcomeBadge,
  ResultBadge,
} from '@/components/calls/call-presentation';
import { useRealtime } from '@/components/providers/realtime-provider';
import type { CallItem } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatPhone, telHref } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { cn, formatDuration } from '@/lib/utils';

/**
 * Журнал на телефоне — список карточек, а не горизонтально скроллящаяся
 * таблица (ТЗ 2.5). Кнопка «Позвонить» уводит в звонилку по tel:.
 */
export function CallCardList({
  calls,
  timezone,
  onSelect,
}: {
  calls: CallItem[];
  timezone: string;
  onSelect: (id: string) => void;
}) {
  const { highlighted } = useRealtime();

  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {calls.map((call) => {
        const number = externalNumber(call);
        const title = call.contact?.name || formatPhone(number);
        return (
          <li
            key={call.id}
            className={cn(
              'surface-card overflow-hidden',
              highlighted.has(call.id) && 'animate-row-flash',
            )}
          >
            <div className="flex items-stretch">
              <button
                type="button"
                onClick={() => onSelect(call.id)}
                className="flex min-w-0 flex-1 flex-col gap-2 p-3 text-left"
                aria-label={`${ru.calls.detailsTitle}: ${title}`}
              >
                <div className="flex items-start gap-2">
                  <DirectionIcon
                    direction={call.direction}
                    status={call.status}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-medium text-[var(--foreground)]">
                      {call.isImportant ? <ImportantStar /> : null}
                      {title}
                    </p>
                    {call.contact?.name ? (
                      <p className="numeric text-2xs truncate text-[var(--text-muted)]">
                        {formatPhone(number)}
                      </p>
                    ) : null}
                  </div>
                  <span className="numeric text-2xs shrink-0 text-[var(--text-muted)]">
                    {formatInZone(call.startedAt, timezone, 'short')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <CallStatusBadge status={call.status} />
                  {call.durationSeconds > 0 ? (
                    <span className="numeric text-2xs text-[var(--text-secondary)]">
                      {formatDuration(call.durationSeconds)}
                    </span>
                  ) : null}
                  <ResultBadge result={call.result} />
                  {call.outcome !== 'NEW' ? <OutcomeBadge outcome={call.outcome} /> : null}
                  {call.recordingReady ? (
                    <Play
                      className="size-3 text-[var(--text-muted)]"
                      aria-label={ru.calls.columnRecording}
                    />
                  ) : null}
                  {call.comment ? (
                    <MessageSquareText
                      className="size-3 text-[var(--text-muted)]"
                      aria-label={ru.calls.comment}
                    />
                  ) : null}
                </div>
              </button>

              <a
                href={telHref(number)}
                className="flex w-14 shrink-0 items-center justify-center border-l border-[var(--border)] text-[var(--brand)] transition-colors active:bg-[var(--brand-soft)] dark:text-[var(--brand-text)]"
                aria-label={`${ru.calls.call} ${formatPhone(number)}`}
              >
                <Phone className="size-5" aria-hidden />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
