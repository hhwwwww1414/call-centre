import type { Metadata } from 'next';

import { ContactDetails } from '@/components/contacts/contact-details';
import { requireUserPage } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.contacts.title };
export const dynamic = 'force-dynamic';

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUserPage(), params]);
  return (
    <ContactDetails
      key={id}
      contactId={id}
      timezone={user.timezone}
      userId={user.id}
      role={user.role}
    />
  );
}
