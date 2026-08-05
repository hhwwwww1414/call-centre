'use client';

import type { Role } from '@prisma/client';
import { Download, PhoneCall } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { CallCardList } from '@/components/calls/call-card-list';
import { CallDrawer } from '@/components/calls/call-drawer';
import { CallFilters, EMPTY_FILTERS, type CallFiltersValue } from '@/components/calls/call-filters';
import { CallTable } from '@/components/calls/call-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, TableSkeleton } from '@/components/ui/misc';
import { buildQuery } from '@/lib/client/api';
import { useCalls, useDebounced, useUsers } from '@/lib/client/hooks';
import { ru } from '@/lib/i18n/ru';
import { pluralWithCount } from '@/lib/utils';

type Props = {
  role: Role;
  timezone: string;
  /** id из /calls/[id] — карточка открыта по прямой ссылке. */
  initialCallId?: string | null;
};

export function CallsScreen({ role, timezone, initialCallId = null }: Props) {
  const searchParams = useSearchParams();
  const isAdmin = role === 'ADMIN';

  const [filters, setFilters] = React.useState<CallFiltersValue>(() => ({
    ...EMPTY_FILTERS,
    search: searchParams.get('search') ?? '',
  }));

  // Поиск из глобальной строки в шапке приходит query-параметром
  React.useEffect(() => {
    const search = searchParams.get('search');
    if (search !== null) setFilters((prev) => (prev.search === search ? prev : { ...prev, search }));
  }, [searchParams]);

  const debouncedSearch = useDebounced(filters.search);

  const queryParams = React.useMemo(
    () => ({
      preset: filters.period.preset,
      from: filters.period.from,
      to: filters.period.to,
      direction: filters.direction,
      status: filters.status,
      outcome: filters.outcome,
      userId: filters.userId,
      search: debouncedSearch.trim() || undefined,
      hasRecording: filters.hasRecording || undefined,
      hasComment: filters.hasComment || undefined,
      limit: 50,
    }),
    [filters, debouncedSearch],
  );

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCalls(queryParams);
  const { data: usersData } = useUsers({ enabled: isAdmin });

  const calls = React.useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  // Карточка звонка — отдельный URL, ссылку можно переслать (ТЗ 5.4)
  const [selectedId, setSelectedId] = React.useState<string | null>(initialCallId);
  React.useEffect(() => setSelectedId(initialCallId), [initialCallId]);

  const openCall = (id: string) => {
    setSelectedId(id);
    window.history.pushState(null, '', `/calls/${id}`);
  };

  const closeCall = () => {
    setSelectedId(null);
    window.history.pushState(null, '', `/calls${window.location.search}`);
  };

  const exportUrl = (format: 'csv' | 'xlsx') =>
    `/api/calls/export${buildQuery({ ...queryParams, limit: undefined, format })}`;

  const hasFilters =
    filters.search.trim() !== '' ||
    Boolean(filters.direction || filters.status || filters.outcome || filters.userId) ||
    filters.hasRecording ||
    filters.hasComment;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-end gap-2">
          <CallFilters
            value={filters}
            onChange={setFilters}
            managers={usersData?.items ?? []}
            showManagerFilter={isAdmin}
          />
        </div>

        {isAdmin ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" title={ru.calls.exportHint}>
                <Download aria-hidden />
                <span className="max-sm:sr-only">{ru.common.export}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <a href={exportUrl('csv')} download>
                  {ru.calls.exportCsv}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={exportUrl('xlsx')} download>
                  {ru.calls.exportXlsx}
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <Card className="overflow-hidden max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        {isLoading ? (
          <TableSkeleton rows={8} columns={isAdmin ? 7 : 6} />
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
        ) : calls.length === 0 ? (
          <EmptyState
            icon={<PhoneCall className="size-5" aria-hidden />}
            title={hasFilters ? ru.calls.emptyFiltered : ru.calls.empty}
            hint={hasFilters ? ru.calls.emptyFilteredHint : ru.calls.emptyHint}
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  {ru.common.reset}
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <CallTable
              calls={calls}
              timezone={timezone}
              showManager={isAdmin}
              selectedId={selectedId}
              onSelect={openCall}
            />
            <CallCardList calls={calls} timezone={timezone} onSelect={openCall} />

            <div className="flex items-center justify-between gap-3 px-3 py-3 max-md:px-0">
              <p className="text-2xs text-[var(--text-muted)]">
                {pluralWithCount(total, 'звонок', 'звонка', 'звонков')} за период
              </p>
              {hasNextPage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {ru.calls.loadMore}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Card>

      <CallDrawer callId={selectedId} timezone={timezone} onClose={closeCall} />
    </div>
  );
}
