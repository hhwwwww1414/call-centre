'use client';

import { ClipboardList } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, TableSkeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAudit } from '@/lib/client/hooks';
import { ru } from '@/lib/i18n/ru';
import { formatInZone } from '@/lib/time';

const ALL = '__all__';

export function AuditScreen({ timezone }: { timezone: string }) {
  const [actorId, setActorId] = React.useState(ALL);
  const [action, setAction] = React.useState(ALL);

  const params = React.useMemo(
    () => ({
      actorId: actorId === ALL ? undefined : actorId,
      action: action === ALL ? undefined : action,
      limit: 50,
    }),
    [actorId, action],
  );

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAudit(params);

  const rows = data?.pages.flatMap((page) => page.items) ?? [];
  const actions = data?.pages[0]?.actions ?? [];
  const actors = data?.pages[0]?.actors ?? [];

  const actionLabel = (value: string) => ru.auditActions[value] ?? value;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Select value={actorId} onValueChange={setActorId}>
          <SelectTrigger className="w-full sm:w-52" aria-label={ru.audit.filterActor}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{ru.common.all}</SelectItem>
            {actors.map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-full sm:w-64" aria-label={ru.audit.filterAction}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{ru.common.all}</SelectItem>
            {actions.map((value) => (
              <SelectItem key={value} value={value}>
                {actionLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        {isLoading ? (
          <TableSkeleton rows={10} columns={5} />
        ) : isError ? (
          <EmptyState
            title={ru.errors.loadFailed}
            hint={ru.errors.genericHint}
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                {ru.common.retry}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" aria-hidden />}
            title={ru.audit.empty}
            hint={ru.audit.emptyHint}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-2xs uppercase tracking-wide text-[var(--text-muted)]">
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {ru.audit.columnDate}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {ru.audit.columnActor}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {ru.audit.columnAction}
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">
                      {ru.audit.columnEntity}
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">
                      {ru.audit.columnIp}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="numeric whitespace-nowrap px-3 py-2.5 text-[var(--text-secondary)]">
                        {formatInZone(row.createdAt, timezone, 'datetime')}
                      </td>
                      <td className="max-w-44 px-3 py-2.5">
                        <span className="block truncate text-[var(--foreground)]">
                          {row.actor?.name ?? ru.audit.system}
                        </span>
                        {row.actor?.email ? (
                          <span className="block truncate text-2xs text-[var(--text-muted)]">
                            {row.actor.email}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={row.action.startsWith('auth.') ? 'outline' : 'neutral'}>
                          {actionLabel(row.action)}
                        </Badge>
                      </td>
                      <td className="hidden max-w-52 px-3 py-2.5 text-[var(--text-muted)] lg:table-cell">
                        <span className="block truncate">
                          {row.entityType}
                          {row.entityId ? ` · ${row.entityId.slice(0, 10)}…` : ''}
                        </span>
                      </td>
                      <td className="numeric hidden px-3 py-2.5 text-[var(--text-muted)] lg:table-cell">
                        {row.ip ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="surface-card flex flex-col gap-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge tone="neutral">{actionLabel(row.action)}</Badge>
                    <span className="numeric shrink-0 text-2xs text-[var(--text-muted)]">
                      {formatInZone(row.createdAt, timezone, 'short')}
                    </span>
                  </div>
                  <p className="text-2xs text-[var(--text-secondary)]">
                    {row.actor?.name ?? ru.audit.system}
                    {row.ip ? ` · ${row.ip}` : ''}
                  </p>
                </li>
              ))}
            </ul>

            {hasNextPage ? (
              <div className="flex justify-center px-3 py-3">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {ru.calls.loadMore}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
