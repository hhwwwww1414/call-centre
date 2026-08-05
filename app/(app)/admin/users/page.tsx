import { Role } from '@prisma/client';
import type { Metadata } from 'next';

import { UsersScreen } from '@/components/admin/users-screen';
import { requireRolePage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.users.title };
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const user = await requireRolePage(Role.ADMIN);
  return <UsersScreen timezone={user.timezone} currentUserId={user.id} />;
}
