import { Role } from '@prisma/client';
import type { Metadata } from 'next';

import { AnalyticsScreen } from '@/components/admin/analytics-screen';
import { requireRolePage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.analytics.title };
export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  await requireRolePage(Role.ADMIN);
  return <AnalyticsScreen />;
}
