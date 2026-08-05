import type { Metadata } from 'next';

import { DashboardScreen } from '@/components/dashboard/dashboard-screen';
import { requireUserPage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.dashboard.title };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUserPage();
  return <DashboardScreen role={user.role} timezone={user.timezone} />;
}
