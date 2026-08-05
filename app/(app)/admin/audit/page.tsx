import { Role } from '@prisma/client';
import type { Metadata } from 'next';

import { AuditScreen } from '@/components/admin/audit-screen';
import { requireRolePage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.audit.title };
export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const user = await requireRolePage(Role.ADMIN);
  return <AuditScreen timezone={user.timezone} />;
}
