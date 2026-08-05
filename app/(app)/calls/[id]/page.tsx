import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CallsScreen } from '@/components/calls/calls-screen';
import { TableSkeleton } from '@/components/ui/misc';
import { requireUserPage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.calls.detailsTitle };
export const dynamic = 'force-dynamic';

/**
 * Прямая ссылка на карточку звонка: под ней тот же журнал, поверх — drawer.
 * Так ссылку можно переслать коллеге, и он увидит контекст, а не голую карточку.
 */
export default async function CallDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUserPage(), params]);

  return (
    <Suspense fallback={<TableSkeleton />}>
      <CallsScreen role={user.role} timezone={user.timezone} initialCallId={id} />
    </Suspense>
  );
}
