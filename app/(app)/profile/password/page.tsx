import type { Metadata } from 'next';

import { PasswordForm } from '@/components/profile/password-form';
import { requireUserPage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.auth.changePassword };
export const dynamic = 'force-dynamic';

export default async function PasswordPage() {
  const user = await requireUserPage();
  return <PasswordForm forced={user.mustChangePassword} />;
}
