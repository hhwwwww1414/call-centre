'use client';

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { useMarketplaceSync, useRunMarketplaceSync } from '@/lib/client/hooks';
import { formatRelative } from '@/lib/time';

/** Связь с площадкой vin2win: когда синхронизировались и сколько клиентов. */
export function MarketplaceSyncCard() {
  const { data, isLoading } = useMarketplaceSync();
  const run = useRunMarketplaceSync();
  const status = data?.status;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>vin2win</CardTitle>
        {data?.configured ? (
          <Button
            variant="secondary"
            size="sm"
            loading={run.isPending}
            onClick={() =>
              run.mutate(undefined, {
                onSuccess: (next) =>
                  next.status?.ok
                    ? toast.success('Синхронизировано')
                    : toast.error(next.status?.error ?? 'Синхронизация не удалась'),
                onError: (error) => toast.error(error.message),
              })
            }
          >
            <RefreshCw aria-hidden />
            Синхронизировать
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !data?.configured ? (
          <p className="text-xs text-[var(--text-muted)]">Не подключено</p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-2xs text-[var(--text-muted)]">Клиентов площадки</dt>
              <dd className="numeric text-lg font-semibold">{data.accounts}</dd>
            </div>
            <div>
              <dt className="text-2xs text-[var(--text-muted)]">Без ответственного</dt>
              <dd className="numeric text-lg font-semibold">
                <Link href="/contacts?owner=none&segment=marketplace" className="hover:underline">
                  {data.unassigned}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-2xs text-[var(--text-muted)]">Последняя синхронизация</dt>
              <dd className="mt-1 flex items-center gap-2 text-xs">
                {status ? (
                  <>
                    <Badge tone={status.ok ? 'success' : 'danger'}>
                      {status.ok ? 'успешно' : 'ошибка'}
                    </Badge>
                    {formatRelative(status.at)}
                  </>
                ) : (
                  'ещё не было'
                )}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
