import type { Metadata } from 'next';

import { ContactsScreen } from '@/components/contacts/contacts-screen';
import { requireUserPage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.contacts.title };
export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  const user = await requireUserPage();
  return <ContactsScreen timezone={user.timezone} />;
}
