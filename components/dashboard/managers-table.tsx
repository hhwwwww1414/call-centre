'use client';

import { EmptyState } from '@/components/ui/misc';
import type { ManagerRow } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { cn, formatDuration } from '@/lib/utils';

/** Разрез по менеджерам (ТЗ 5.3). На телефоне — карточки вместо таблицы. */
export function ManagersTable({ rows }: { rows: ManagerRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title={ru.dashboard.emptyCalls} hint={ru.dashboard.emptyCallsHint} />;
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-2xs uppercase tracking-wide text-[var(--text-muted)]">
              <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                {ru.calls.columnManager}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {ru.dashboard.kpiTotal}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {ru.dashboard.kpiAnswered}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {ru.dashboard.kpiMissed}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {ru.dashboard.kpiAvgDuration}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">
                {ru.dashboard.kpiTalkTime}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId ?? 'unassigned'} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-2.5 sm:px-5">
                  <span
                    className={cn(
                      'font-medium',
                      row.name ? 'text-[var(--foreground)]' : 'text-[var(--text-muted)]',
                    )}
                  >
                    {row.name ?? ru.calls.unassigned}
                  </span>
                  {row.extension ? (
                    <span className="numeric ml-1.5 text-2xs text-[var(--text-muted)]">
                      доб. {row.extension}
                    </span>
                  ) : null}
                  {!row.isActive && row.name ? (
                    <span className="ml-1.5 text-2xs text-[var(--text-muted)]">
                      ({ru.users.statusDisabled.toLowerCase()})
                    </span>
                  ) : null}
                </td>
                <td className="numeric px-3 py-2.5 text-right text-[var(--foreground)]">{row.total}</td>
                <td className="numeric px-3 py-2.5 text-right text-[var(--brand)] dark:text-[var(--brand-text)]">
                  {row.answered}
                </td>
                <td
                  className={cn(
                    'numeric px-3 py-2.5 text-right',
                    row.missedShare > 20 ? 'text-[var(--destructive)]' : 'text-[var(--text-secondary)]',
                  )}
                >
                  {row.missed}
                  <span className="ml-1 text-2xs text-[var(--text-muted)]">{row.missedShare}%</span>
                </td>
                <td className="numeric px-3 py-2.5 text-right text-[var(--text-secondary)]">
                  {formatDuration(row.avgDurationSeconds)}
                </td>
                <td className="numeric px-4 py-2.5 text-right text-[var(--text-secondary)] sm:px-5">
                  {formatDuration(row.talkTimeSeconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--border)] md:hidden">
        {rows.map((row) => (
          <li key={row.userId ?? 'unassigned'} className="flex flex-col gap-1.5 px-4 py-3">
            <span className="text-xs font-medium text-[var(--foreground)]">
              {row.name ?? ru.calls.unassigned}
            </span>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">{ru.dashboard.kpiTotal}</dt>
                <dd className="numeric text-[var(--foreground)]">{row.total}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">{ru.dashboard.kpiAnswered}</dt>
                <dd className="numeric text-[var(--brand)] dark:text-[var(--brand-text)]">{row.answered}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">{ru.dashboard.kpiMissed}</dt>
                <dd className="numeric text-[var(--text-secondary)]">
                  {row.missed} · {row.missedShare}%
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-muted)]">{ru.dashboard.kpiTalkTime}</dt>
                <dd className="numeric text-[var(--text-secondary)]">
                  {formatDuration(row.talkTimeSeconds)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
