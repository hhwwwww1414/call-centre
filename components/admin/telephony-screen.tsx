'use client';

import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  PhoneOutgoing,
  PlugZap,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/client/api';
import { useCopy, useTelephonyStatus, useUsers } from '@/lib/client/hooks';
import { ru } from '@/lib/i18n/ru';
import { formatInZone } from '@/lib/time';

const AUTO_MANAGER = '__auto__';

export function TelephonyScreen({ timezone }: { timezone: string }) {
  const { data, isLoading, refetch } = useTelephonyStatus();
  const { data: usersData } = useUsers();
  const { copied, copy } = useCopy();
  const [managerId, setManagerId] = React.useState(AUTO_MANAGER);
  const [health, setHealth] = React.useState<{ ok: boolean; message?: string } | null>(null);

  const checkConnection = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message?: string }>('/api/admin/telephony/health', {
        method: 'POST',
      }),
    onSuccess: (result) => {
      setHealth(result);
      if (result.ok) toast.success(ru.telephony.statusOk, { description: result.message });
      else toast.error(ru.telephony.statusFail, { description: result.message });
    },
    onError: () => toast.error(ru.errors.generic, { description: ru.errors.genericHint }),
  });

  const testCall = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/telephony/test-call', {
        method: 'POST',
        body: JSON.stringify({ userId: managerId === AUTO_MANAGER ? undefined : managerId }),
      }),
    onSuccess: () => {
      toast.success(ru.telephony.testCallCreated);
      void refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : ru.errors.generic),
  });

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const isMock = data.provider === 'mock';
  const isSipuni = data.provider === 'sipuni';
  const notConfigured = !isMock && !data.configured;
  const providerLabel = isMock
    ? ru.telephony.providerMock
    : isSipuni
      ? ru.telephony.providerSipuni
      : ru.telephony.providerExolve;

  return (
    <div className="flex flex-col gap-4">
      {notConfigured ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--price-margin-badge-bg)] bg-[var(--price-margin-badge-bg)]/12 p-4">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-[var(--price-margin-badge-text)] dark:text-[var(--price-margin-badge-bg)]"
            aria-hidden
          />
          <div>
            <p className="text-xs font-medium text-[var(--foreground)]">
              {isSipuni
                ? ru.telephony.sipuniNotConfiguredTitle
                : ru.telephony.exolveNotConfiguredTitle}
            </p>
            <p className="text-2xs mt-0.5 text-[var(--text-secondary)]">
              {isSipuni
                ? ru.telephony.sipuniNotConfiguredHint
                : ru.telephony.exolveNotConfiguredHint}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ru.telephony.currentProvider}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge tone={isMock ? 'attention' : data.configured ? 'success' : 'danger'}>
                {providerLabel}
              </Badge>
              <span className="text-2xs text-[var(--text-muted)]">
                TELEPHONY_PROVIDER={data.provider}
              </span>
            </div>

            <dl className="text-2xs grid grid-cols-2 gap-2">
              <div>
                <dt className="text-[var(--text-muted)]">{ru.telephony.connectionStatus}</dt>
                <dd className="flex items-center gap-1 text-[var(--text-secondary)]">
                  {health ? (
                    health.ok ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-[var(--success)]" aria-hidden />
                        {ru.telephony.statusOk}
                      </>
                    ) : (
                      <>
                        <XCircle className="size-3.5 text-[var(--destructive)]" aria-hidden />
                        {ru.telephony.statusFail}
                      </>
                    )
                  ) : data.configured ? (
                    ru.common.notSet
                  ) : (
                    ru.telephony.statusNotConfigured
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Звонков за сутки</dt>
                <dd className="numeric text-[var(--text-secondary)]">{data.callsLast24h}</dd>
              </div>
              {data.lastCall ? (
                <div className="col-span-2">
                  <dt className="text-[var(--text-muted)]">Последнее событие</dt>
                  <dd className="numeric text-[var(--text-secondary)]">
                    {formatInZone(data.lastCall.startedAt, timezone, 'datetime')} ·{' '}
                    {ru.callStatus[data.lastCall.status]}
                  </dd>
                </div>
              ) : null}
            </dl>

            {health?.message ? (
              <p className="text-2xs rounded-md bg-[var(--surface-2)] p-2.5 text-[var(--text-secondary)]">
                {health.message}
              </p>
            ) : null}

            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              loading={checkConnection.isPending}
              onClick={() => checkConnection.mutate()}
            >
              <PlugZap aria-hidden />
              {checkConnection.isPending ? ru.telephony.checking : ru.telephony.checkConnection}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{ru.telephony.webhookUrl}</CardTitle>
              <p className="text-2xs mt-0.5 text-[var(--text-muted)]">
                {ru.telephony.webhookUrlHint}
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <code className="text-2xs min-w-0 flex-1 rounded-md bg-[var(--surface-2)] px-3 py-2.5 break-all text-[var(--foreground)] select-all">
                {data.webhookUrl}
              </code>
              <Button
                variant={copied ? 'primary' : 'secondary'}
                size="icon"
                onClick={() => void copy(data.webhookUrl)}
                aria-label={ru.common.copy}
              >
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              </Button>
            </div>

            {data.provider !== 'exolve' ? (
              <div>
                <p className="text-2xs mb-1.5 font-medium text-[var(--text-secondary)]">
                  {ru.telephony.routingUrl}
                </p>
                <p className="text-2xs mb-2 text-[var(--text-muted)]">
                  {ru.telephony.routingUrlHint}
                </p>
                <code className="text-2xs block rounded-md bg-[var(--surface-2)] px-3 py-2.5 break-all text-[var(--foreground)] select-all">
                  {data.routingUrl}
                </code>
              </div>
            ) : null}

            <div>
              <p className="text-2xs mb-1.5 font-medium text-[var(--text-secondary)]">
                {ru.telephony.credentials}
              </p>
              <p className="text-2xs mb-2 text-[var(--text-muted)]">
                {ru.telephony.credentialsHint}
              </p>
              <ul className="flex flex-col gap-1">
                {Object.entries(data.credentials).map(([key, configured]) => (
                  <li key={key} className="text-2xs flex items-center justify-between gap-2">
                    <code className="text-[var(--text-secondary)]">{key}</code>
                    <Badge tone={configured ? 'success' : 'outline'}>
                      {configured
                        ? ru.telephony.credentialConfigured
                        : ru.telephony.credentialMissing}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.provider !== 'exolve' ? (
        <Card>
          <CardHeader>
            <CardTitle>{ru.telephony.sipuniSetup}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2.5">
              {ru.telephony.sipuniSetupSteps.map((step, index) => (
                <li key={step} className="flex gap-3 text-xs text-[var(--text-secondary)]">
                  <span className="numeric text-2xs flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] font-semibold text-[var(--brand)] dark:text-[var(--brand-text)]">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{ru.telephony.generateTestCall}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Звонок разыгрывается во времени: дозвон → разговор → завершение. Откройте журнал в
            соседней вкладке — строка будет меняться без перезагрузки.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger className="w-full sm:w-56" aria-label={ru.calls.filterManager}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_MANAGER}>Любому менеджеру</SelectItem>
                {(usersData?.items ?? [])
                  .filter((user) => user.isActive)
                  .map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Button
              variant="primary"
              size="md"
              disabled={!isMock}
              loading={testCall.isPending}
              onClick={() => testCall.mutate()}
              title={isMock ? undefined : ru.telephony.testCallOnlyMock}
            >
              <PhoneOutgoing aria-hidden />
              {testCall.isPending ? ru.telephony.generating : ru.telephony.generateTestCall}
            </Button>
          </div>

          {!isMock ? (
            <p className="text-2xs text-[var(--text-muted)]">{ru.telephony.testCallOnlyMock}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ru.telephony.routing}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg border border-dashed border-[var(--border-strong)] p-4 text-xs text-[var(--text-secondary)]">
            {ru.telephony.routingStub}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
