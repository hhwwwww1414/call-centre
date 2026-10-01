'use client';

import type { Role } from '@prisma/client';
import { CheckCircle2, Clock, PhoneCall, PhoneMissed, Timer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  CallStatusBadge,
  DirectionIcon,
  externalNumber,
  OutcomeBadge,
} from '@/components/calls/call-presentation';
import { CallButton } from '@/components/calls/call-button';
import { PeriodPicker, type PeriodValue } from '@/components/common/period-picker';
import { CallsBySeriesChart, OutcomePieChart } from '@/components/dashboard/charts';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { ManagersTable } from '@/components/dashboard/managers-table';
import { TasksWidget } from '@/components/tasks/tasks-widget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStats, useUsers } from '@/lib/client/hooks';
import type { CallItem } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { formatInZone, formatRelative } from '@/lib/time';
import { formatDuration } from '@/lib/utils';

const ALL_MANAGERS = '__all__';

export function DashboardScreen({ role, timezone }: { role: Role; timezone: string }) {
  const router = useRouter();
  const isAdmin = role === 'ADMIN';

  const [period, setPeriod] = React.useState<PeriodValue>({ preset: 'today' });
  const [userId, setUserId] = React.useState<string>(ALL_MANAGERS);

  const params = React.useMemo(
    () => ({
      preset: period.preset,
      from: period.from,
      to: period.to,
      userId: userId === ALL_MANAGERS ? undefined : userId,
    }),
    [period, userId],
  );

  const { data, isLoading, isError, refetch } = useStats(params);
  const { data: usersData } = useUsers({ enabled: isAdmin });

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

  const kpi = data?.kpi;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <PeriodPicker value={period} onChange={setPeriod} />

        {isAdmin ? (
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-full sm:w-56" aria-label={ru.dashboard.scopeManager}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MANAGERS}>{ru.dashboard.scopeCompany}</SelectItem>
              <SelectItem value="unassigned">{ru.calls.unassigned}</SelectItem>
              {(usersData?.items ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <TasksWidget role={role} timezone={timezone} />

      <div
        className={`grid grid-cols-2 gap-3 ${isAdmin ? 'md:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-4'}`}
      >
        <KpiCard
          label={ru.dashboard.kpiTotal}
          value={kpi?.total ?? 0}
          icon={PhoneCall}
          loading={isLoading}
        />
        <KpiCard
          label={ru.dashboard.kpiAnswered}
          value={kpi?.answered ?? 0}
          icon={CheckCircle2}
          tone="success"
          loading={isLoading}
        />
        <KpiCard
          label={ru.dashboard.kpiMissed}
          value={kpi?.missed ?? 0}
          hint={kpi ? `${kpi.missedShare}% от всех` : undefined}
          icon={PhoneMissed}
          tone={kpi && kpi.missedShare > 20 ? 'danger' : 'neutral'}
          loading={isLoading}
        />
        <KpiCard
          label={ru.dashboard.kpiAvgDuration}
          value={formatDuration(kpi?.avgDurationSeconds ?? 0)}
          icon={Timer}
          loading={isLoading}
        />
        {isAdmin ? (
          <>
            <KpiCard
              label={ru.dashboard.kpiAvgWait}
              value={`${kpi?.avgWaitSeconds ?? 0} с`}
              hint="Среднее время до ответа"
              icon={Clock}
              loading={isLoading}
            />
            <KpiCard
              label={ru.dashboard.kpiTalkTime}
              value={formatDuration(kpi?.talkTimeSeconds ?? 0)}
              hint="Суммарно за период"
              icon={Timer}
              loading={isLoading}
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{ru.dashboard.byHour}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-60 w-full" />
            ) : (
              <CallsBySeriesChart
                series={data?.series ?? []}
                granularity={data?.period.granularity ?? 'hour'}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ru.dashboard.byOutcome}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-60 w-full" />
            ) : (
              <OutcomePieChart data={data?.outcomes ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Главный рабочий блок менеджера — заметный и первый по порядку (ТЗ 5.3) */}
        <Card className="border-[var(--brand)]/25 lg:order-first">
          <CardHeader>
            <CardTitle>{ru.dashboard.callbackQueue}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-0">
            {isLoading ? (
              <div className="px-4 sm:px-5">
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (data?.callbackQueue.length ?? 0) === 0 ? (
              <EmptyState
                title={ru.dashboard.emptyCallback}
                hint={ru.dashboard.emptyCallbackHint}
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {data?.callbackQueue.map((call) => (
                  <CallbackRow
                    key={call.id}
                    call={call}
                    onOpen={() => router.push(`/calls/${call.id}`)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ru.dashboard.recentCalls}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-0">
            {isLoading ? (
              <div className="px-4 sm:px-5">
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (data?.recent.length ?? 0) === 0 ? (
              <EmptyState title={ru.dashboard.emptyCalls} hint={ru.dashboard.emptyCallsHint} />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {data?.recent.map((call) => (
                  <RecentRow
                    key={call.id}
                    call={call}
                    timezone={timezone}
                    onOpen={() => router.push(`/calls/${call.id}`)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>{ru.dashboard.byManager}</CardTitle>
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
      ) : null}
    </div>
  );
}

function CallbackRow({ call, onOpen }: { call: CallItem; onOpen: () => void }) {
  const number = externalNumber(call);
  return (
    <li className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <DirectionIcon direction={call.direction} status={call.status} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="numeric block truncate text-xs font-medium text-[var(--foreground)]">
            {call.contact?.name || formatPhone(number)}
          </span>
          <span className="text-2xs block truncate text-[var(--text-muted)]">
            {formatRelative(call.startedAt)}
          </span>
        </span>
        <OutcomeBadge outcome={call.outcome} />
      </button>
      <CallButton phone={number} />
    </li>
  );
}

function RecentRow({
  call,
  timezone,
  onOpen,
}: {
  call: CallItem;
  timezone: string;
  onOpen: () => void;
}) {
  const number = externalNumber(call);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface)] sm:px-5"
      >
        <DirectionIcon direction={call.direction} status={call.status} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="numeric block truncate text-xs font-medium text-[var(--foreground)]">
            {call.contact?.name || formatPhone(number)}
          </span>
          <span className="numeric text-2xs block truncate text-[var(--text-muted)]">
            {formatInZone(call.startedAt, timezone, 'short')}
            {call.durationSeconds > 0 ? ` · ${formatDuration(call.durationSeconds)}` : ''}
          </span>
        </span>
        <CallStatusBadge status={call.status} />
      </button>
    </li>
  );
}
