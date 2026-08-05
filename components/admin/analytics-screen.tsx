'use client';

import * as React from 'react';

import { PeriodPicker, type PeriodValue } from '@/components/common/period-picker';
import {
  HourLoadChart,
  MissedShareChart,
  OutcomePieChart,
  WeekdayLoadChart,
} from '@/components/dashboard/charts';
import { ManagersTable } from '@/components/dashboard/managers-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAnalytics, useUsers } from '@/lib/client/hooks';
import { ru } from '@/lib/i18n/ru';

const ALL = '__all__';

/** Расширенный дашборд для админа (ТЗ 5.7). */
export function AnalyticsScreen() {
  const [period, setPeriod] = React.useState<PeriodValue>({ preset: '30d' });
  const [userId, setUserId] = React.useState(ALL);

  const params = React.useMemo(
    () => ({
      preset: period.preset,
      from: period.from,
      to: period.to,
      userId: userId === ALL ? undefined : userId,
    }),
    [period, userId],
  );

  const { data, isLoading, isError, refetch } = useAnalytics(params);
  const { data: usersData } = useUsers();

  if (isError) {
    return (
      <Card>
        <EmptyState
          title={ru.errors.loadFailed}
          hint={ru.errors.genericHint}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              {ru.common.retry}
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <PeriodPicker value={period} onChange={setPeriod} />
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-full sm:w-56" aria-label={ru.calls.filterManager}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{ru.dashboard.scopeCompany}</SelectItem>
            {(usersData?.items ?? []).map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ru.analytics.managersCompare}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-0">
          {isLoading ? (
            <div className="px-4 sm:px-5">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <ManagersTable rows={data?.managers ?? []} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ru.analytics.loadByHour}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-60 w-full" /> : <HourLoadChart hours={data?.hours ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ru.analytics.loadByWeekday}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <WeekdayLoadChart weekdays={data?.weekdays ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ru.analytics.outcomeFunnel}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-60 w-full" /> : <OutcomePieChart data={data?.outcomes ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{ru.analytics.missedByHour}</CardTitle>
              <p className="mt-0.5 text-2xs text-[var(--text-muted)]">
                Часы с высокой долей — кандидаты на усиление смены
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <MissedShareChart hours={data?.hours ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
