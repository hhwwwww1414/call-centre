import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CallsScreen } from '@/components/calls/calls-screen';
import { TableSkeleton } from '@/components/ui/misc';
import { requireUserPage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.calls.title };
export const dynamic = 'force-dynamic';

export default async function CallsPage() {
  const user = await requireUserPage();
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CallsScreen role={user.role} timezone={user.timezone} />
    </Suspense>
  );
}
