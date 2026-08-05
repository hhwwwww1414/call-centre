import { Role } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRolePage } from '@/lib/auth/rbac';
import { appUrl, buildVersion } from '@/lib/config';
import { ru } from '@/lib/i18n/ru';
import { getProviderName } from '@/lib/telephony';

export const metadata: Metadata = { title: ru.nav.settings };
export const dynamic = 'force-dynamic';

/**
 * Настройки системы. Чувствительные значения задаются переменными окружения
 * на сервере и в интерфейс не выводятся — здесь только состояние (ТЗ 5.8).
 */
export default async function AdminSettingsPage() {
  await requireRolePage(Role.ADMIN);

  const rows: { label: string; value: string; hint?: string }[] = [
    { label: 'Адрес приложения', value: appUrl() },
    { label: 'Версия сборки', value: buildVersion() },
    { label: 'Провайдер телефонии', value: getProviderName(), hint: 'TELEPHONY_PROVIDER' },
    {
      label: 'Часовой пояс сервера',
      value: process.env.TZ || 'не задан',
      hint: 'Данные хранятся в UTC, показываются в поясе пользователя',
    },
    {
      label: 'Уровень логирования',
      value: process.env.LOG_LEVEL || 'info',
      hint: 'LOG_LEVEL',
    },
    {
      label: 'Шифрование настроек',
      value: process.env.ENCRYPTION_KEY ? 'настроено' : 'не настроено',
      hint: 'ENCRYPTION_KEY, AES-256-GCM',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Состояние системы</CardTitle>
            <p className="mt-0.5 text-2xs text-[var(--text-muted)]">
              Значения задаются переменными окружения на сервере. Секреты здесь не показываются
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-[var(--border)]">
            {rows.map((row) => (
              <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <dt className="text-xs text-[var(--text-secondary)]">
                  {row.label}
                  {row.hint ? (
                    <span className="ml-1.5 text-2xs text-[var(--text-muted)]">{row.hint}</span>
                  ) : null}
                </dt>
                <dd className="numeric text-xs font-medium text-[var(--foreground)]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

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
