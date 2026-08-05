import type { Metadata } from 'next';

import { ProfileScreen } from '@/components/profile/profile-screen';
import { requireUserPage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.profile.title };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUserPage();
  return <ProfileScreen user={user} />;
}
