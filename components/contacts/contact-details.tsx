'use client';

import type { Role } from '@prisma/client';
import { ArrowLeft, Ban, ShieldCheck, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { CallButton } from '@/components/calls/call-button';
import { ContactActivity } from '@/components/contacts/contact-activity';
import { readListPosition } from '@/components/contacts/list-position';
import { MarketplacePanel } from '@/components/contacts/marketplace-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useContact, useTaskAssignees, useUpdateContact } from '@/lib/client/hooks';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { formatDuration, pluralWithCount } from '@/lib/utils';

/** Карточка контакта = вся история общения (ТЗ 5.5). */
export function ContactDetails({
  contactId,
  timezone,
  userId,
  role,
}: {
  contactId: string;
  timezone: string;
  userId: string;
  role: Role;
}) {
  const router = useRouter();
  const { data: pages, isLoading, isError } = useContact(contactId);
  const data = pages?.pages[0];
  const update = useUpdateContact(contactId);

  const [form, setForm] = React.useState({ name: '', company: '', note: '' });
  const [dirty, setDirty] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!data || dirty) return;
    setForm({
      name: data.contact.name ?? '',
      company: data.contact.company ?? '',
      note: data.contact.note ?? '',
    });
    setDirty(false);
  }, [data, dirty]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <EmptyState
          title={ru.contacts.notFound}
          hint={ru.calls.notFoundHint}
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href="/contacts">{ru.common.back}</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const { contact, summary } = data;

  const save = () => {
    update.mutate(
      { name: form.name || null, company: form.company || null, note: form.note || null },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success(ru.common.saved);
        },
        onError: () => toast.error(ru.errors.saveFailed, { description: ru.errors.saveFailedHint }),
      },
    );
  };

  const toggleBlock = () => {
    update.mutate(
      { isBlocked: !contact.isBlocked },
      {
        onSuccess: () => toast.success(contact.isBlocked ? ru.contacts.unblock : ru.contacts.block),
        onError: () => toast.error(ru.errors.saveFailed, { description: ru.errors.saveFailedHint }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="max-sm:basis-full max-sm:justify-start"
          onClick={() => {
            // Пришли из списка — возвращаемся в него на то же место, иначе в начало
            const saved = readListPosition();
            if (saved?.contactId === contactId) router.back();
            else router.push('/contacts');
          }}
        >
          <ArrowLeft aria-hidden />
          {ru.common.back}
        </Button>
        <Avatar name={contact.name ?? contact.company ?? '?'} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight break-words text-[var(--foreground)] sm:text-lg">
            {contact.name ?? formatPhone(contact.phoneE164)}
          </p>
          {contact.name ? (
            <p className="numeric text-2xs truncate text-[var(--text-muted)]">
              {formatPhone(contact.phoneE164)}
            </p>
          ) : null}
        </div>
        {contact.isBlocked ? (
          <Badge tone="danger">
            <Ban className="size-3" aria-hidden />
            {ru.contacts.blocked}
          </Badge>
        ) : null}
        <CallButton phone={contact.phoneE164} iconOnly={false} variant="primary" />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--text-secondary)]">
        <span>{pluralWithCount(summary.calls, 'звонок', 'звонка', 'звонков')}</span>
        <span>{formatDuration(summary.durationSeconds)} в разговоре</span>
        <span>
          Последний звонок:{' '}
          {summary.lastCallAt
            ? formatInZone(summary.lastCallAt, timezone, 'datetime')
            : 'ещё не было'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={() => setDetailsOpen(!detailsOpen)}
          aria-expanded={detailsOpen}
          aria-controls="client-details"
        >
          Данные клиента {detailsOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </Button>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <Card id="client-details" className={detailsOpen ? '' : 'hidden lg:block'}>
          <CardHeader>
            <CardTitle>Данные клиента</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <OwnerField
              ownerId={contact.ownerId}
              ownerName={contact.owner?.name ?? null}
              userId={userId}
              canAssign={role === 'ADMIN' || role === 'SUPERVISOR'}
              saving={update.isPending}
              onChange={(ownerId) =>
                update.mutate(
                  { ownerId },
                  {
                    onSuccess: () => toast.success(ru.contacts.ownerChanged),
                    onError: (error) =>
                      toast.error(error instanceof Error ? error.message : ru.errors.saveFailed),
                  },
                )
              }
            />
            <Field label={ru.contacts.name} htmlFor="contact-name">
              <Input
                id="contact-name"
                value={form.name}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, name: event.target.value }));
                  setDirty(true);
                }}
              />
            </Field>
            <Field label={ru.contacts.company} htmlFor="contact-company">
              <Input
                id="contact-company"
                value={form.company}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, company: event.target.value }));
                  setDirty(true);
                }}
              />
            </Field>
            <Field label={ru.contacts.note} htmlFor="contact-note">
              <Textarea
                id="contact-note"
                value={form.note}
                placeholder={ru.contacts.notePlaceholder}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, note: event.target.value }));
                  setDirty(true);
                }}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={save}
                loading={update.isPending}
                disabled={!dirty}
              >
                {ru.common.save}
              </Button>
              <Button
                variant={contact.isBlocked ? 'secondary' : 'outline'}
                size="sm"
                onClick={toggleBlock}
                loading={update.isPending}
              >
                {contact.isBlocked ? <ShieldCheck aria-hidden /> : <Ban aria-hidden />}
                {contact.isBlocked ? ru.contacts.unblock : ru.contacts.block}
              </Button>
            </div>
            <p className="text-2xs text-[var(--text-muted)]">
              В CRM с {formatInZone(contact.createdAt, timezone, 'date')}
            </p>
          </CardContent>
        </Card>
        <div className="flex min-w-0 flex-col gap-5">
          {contact.marketplace && data.marketplaceLinks ? (
            <MarketplacePanel
              account={contact.marketplace}
              links={data.marketplaceLinks}
              timezone={timezone}
            />
          ) : null}
          <ContactActivity contactId={contactId} timezone={timezone} summary={summary} />
        </div>
      </div>
    </div>
  );
}

const NO_OWNER = '__none__';

/**
 * Ответственный за клиента. Админ назначает любого, менеджер может взять
 * себе только свободного клиента — чужих не перехватывает.
 */
function OwnerField({
  ownerId,
  ownerName,
  userId,
  canAssign,
  saving,
  onChange,
}: {
  ownerId: string | null;
  ownerName: string | null;
  userId: string;
  canAssign: boolean;
  saving: boolean;
  onChange: (ownerId: string | null) => void;
}) {
  const assignees = useTaskAssignees(canAssign);

  if (canAssign) {
    return (
      <Field label={ru.contacts.owner} htmlFor="contact-owner">
        <Select
          value={ownerId ?? NO_OWNER}
          onValueChange={(value) => onChange(value === NO_OWNER ? null : value)}
          disabled={saving}
        >
          <SelectTrigger id="contact-owner">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_OWNER}>{ru.contacts.ownerNone}</SelectItem>
            {(assignees.data?.items ?? []).map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.name}
                {person.extension ? ` · доб. ${person.extension}` : ''}
              </SelectItem>
            ))}
            {/* Заблокированный ответственный не попадает в список, но должен отображаться */}
            {ownerId && !assignees.data?.items.some((p) => p.id === ownerId) ? (
              <SelectItem value={ownerId}>{ownerName ?? ownerId}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{ru.contacts.owner}</span>
      <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--surface-2)] px-3 py-2">
        <span className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <UserCheck className="size-4 text-[var(--text-muted)]" aria-hidden />
          {ownerName ?? ru.contacts.ownerNone}
        </span>
        {!ownerId ? (
          <Button variant="secondary" size="sm" loading={saving} onClick={() => onChange(userId)}>
            {ru.contacts.takeOwnership}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
