import { Role } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRolePage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.nav.settings };
export const dynamic = 'force-dynamic';

/** Настройки системы: вход в разделы администрирования. */
export default async function AdminSettingsPage() {
  await requireRolePage(Role.ADMIN);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Разделы администрирования</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/admin/users">{ru.nav.users}</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/admin/telephony">{ru.nav.telephony}</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/admin/audit">{ru.nav.audit}</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/admin/analytics">{ru.nav.analytics}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
