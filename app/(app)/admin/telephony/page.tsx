import { Role } from '@prisma/client';
import type { Metadata } from 'next';

import { TelephonyScreen } from '@/components/admin/telephony-screen';
import { requireRolePage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.telephony.title };
export const dynamic = 'force-dynamic';

export default async function AdminTelephonyPage() {
  const user = await requireRolePage(Role.ADMIN);
  return <TelephonyScreen timezone={user.timezone} />;
}
