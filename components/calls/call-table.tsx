'use client';

import { MessageSquareText, Play } from 'lucide-react';
import * as React from 'react';

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
import { formatPhone } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { cn, formatDuration } from '@/lib/utils';

type Props = {
  calls: CallItem[];
  timezone: string;
  showManager: boolean;
  selectedId?: string | null;
  onSelect: (id: string) => void;
};

/**
 * Журнал на десктопе. Новая строка коротко подсвечивается зелёным и гаснет
 * за 2 секунды; при prefers-reduced-motion анимация выключается глобально
 * правилом в globals.css (ТЗ 5.4).
 */
export function CallTable({ calls, timezone, showManager, selectedId, onSelect }: Props) {
  const { highlighted } = useRealtime();

  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-2xs border-b border-[var(--border)] text-left text-[var(--text-muted)]">
            <th scope="col" className="px-3 py-2.5 font-medium">
              {ru.calls.columnStatus}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              {ru.calls.columnContact}
            </th>
            {showManager ? (
              <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">
                {ru.calls.columnManager}
              </th>
            ) : null}
            <th scope="col" className="px-3 py-2.5 font-medium">
              {ru.calls.columnStartedAt}
            </th>
            <th scope="col" className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">
              {ru.calls.columnWait}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              {ru.calls.columnDuration}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              {ru.calls.columnOutcome}
            </th>
            <th scope="col" className="px-3 py-2.5 text-center font-medium">
              <span className="sr-only">{ru.calls.columnRecording}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => {
            const isNew = highlighted.has(call.id);
            const number = externalNumber(call);
            return (
              <tr
                key={call.id}
                onClick={() => onSelect(call.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(call.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${ru.calls.detailsTitle}: ${formatPhone(number)}`}
                className={cn(
                  'cursor-pointer border-b border-[var(--border)] transition-colors',
                  'hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)]',
                  selectedId === call.id && 'bg-[var(--accent)]',
                  isNew && 'animate-row-flash',
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <DirectionIcon direction={call.direction} status={call.status} />
                    <CallStatusBadge status={call.status} />
                  </div>
                </td>

                <td className="max-w-64 px-3 py-2.5">
                  <div className="flex flex-col">
                    <span className="numeric flex items-center gap-1 truncate font-medium text-[var(--foreground)]">
                      {call.isImportant ? <ImportantStar /> : null}
                      {formatPhone(number)}
                    </span>
                    {call.contact?.name || call.contact?.company ? (
                      <span className="text-2xs truncate text-[var(--text-muted)]">
                        {[call.contact?.name, call.contact?.company].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </div>
                </td>

                {showManager ? (
                  <td className="hidden max-w-40 px-3 py-2.5 lg:table-cell">
                    <span className="truncate text-[var(--text-secondary)]">
                      {call.user?.name ?? (
                        <span className="text-[var(--text-muted)]">{ru.calls.unassigned}</span>
                      )}
                    </span>
                  </td>
                ) : null}

                <td className="numeric px-3 py-2.5 whitespace-nowrap text-[var(--text-secondary)]">
                  {formatInZone(call.startedAt, timezone, 'datetime')}
                </td>

                <td className="numeric hidden px-3 py-2.5 text-right text-[var(--text-muted)] lg:table-cell">
                  {call.waitSeconds != null ? `${call.waitSeconds} с` : '—'}
                </td>

                <td className="numeric px-3 py-2.5 text-right text-[var(--foreground)]">
                  {call.durationSeconds > 0 ? formatDuration(call.durationSeconds) : '—'}
                </td>

                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <ResultBadge result={call.result} />
                    {call.outcome !== 'NEW' || !call.result ? (
                      <OutcomeBadge outcome={call.outcome} />
                    ) : null}
                  </div>
                </td>

                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-1.5 text-[var(--text-muted)]">
                    {call.recordingReady ? (
                      <Play className="size-3.5" aria-label={ru.calls.columnRecording} />
                    ) : null}
                    {call.comment ? (
                      <MessageSquareText className="size-3.5" aria-label={ru.calls.comment} />
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
