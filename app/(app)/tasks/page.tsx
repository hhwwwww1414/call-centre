import type { Metadata } from 'next';

import { TasksScreen } from '@/components/tasks/tasks-screen';
import { requireUserPage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.tasks.title };
export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const user = await requireUserPage();
  return <TasksScreen role={user.role} timezone={user.timezone} />;
}
