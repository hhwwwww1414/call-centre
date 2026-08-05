'use client';

import { ArrowLeft, Ban, Phone, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import {
  CallStatusBadge,
  DirectionIcon,
  OutcomeBadge,
} from '@/components/calls/call-presentation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { useContact, useUpdateContact } from '@/lib/client/hooks';
import { ru } from '@/lib/i18n/ru';
import { formatPhone, telHref } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { formatDuration, pluralWithCount } from '@/lib/utils';

/** Карточка контакта = вся история общения (ТЗ 5.5). */
export function ContactDetails({ contactId, timezone }: { contactId: string; timezone: string }) {
  const router = useRouter();
  const { data, isLoading, isError } = useContact(contactId);
  const update = useUpdateContact(contactId);

  const [form, setForm] = React.useState({ name: '', company: '', note: '' });
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!data) return;
    setForm({
      name: data.contact.name ?? '',
      company: data.contact.company ?? '',
      note: data.contact.note ?? '',
    });
    setDirty(false);
  }, [data]);

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

  const { contact, calls } = data;

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
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/contacts')}>
          <ArrowLeft aria-hidden />
          {ru.common.back}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[var(--foreground)]">
            {contact.name ?? formatPhone(contact.phoneE164)}
          </p>
          {contact.name ? (
            <p className="numeric truncate text-2xs text-[var(--text-muted)]">
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
        <Button variant="secondary" size="sm" asChild>
          <a href={telHref(contact.phoneE164)}>
            <Phone aria-hidden />
            {ru.calls.call}
          </a>
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{ru.contacts.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
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
              <Button variant="primary" size="sm" onClick={save} loading={update.isPending} disabled={!dirty}>
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
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{ru.contacts.history}</CardTitle>
              <p className="mt-0.5 text-2xs text-[var(--text-muted)]">
                {pluralWithCount(calls.length, 'звонок', 'звонка', 'звонков')}
              </p>
            </div>
          </CardHeader>
          <CardContent className="px-0 sm:px-0">
            {calls.length === 0 ? (
              <EmptyState title={ru.calls.contactHistoryEmpty} />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {calls.map((call) => (
                  <li key={call.id}>
                    <Link
                      href={`/calls/${call.id}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-[var(--surface)] sm:px-5"
                    >
                      <DirectionIcon direction={call.direction} status={call.status} className="shrink-0" />
                      <span className="numeric min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                        {formatInZone(call.startedAt, timezone, 'datetime')}
                      </span>
                      <span className="numeric shrink-0 text-2xs text-[var(--text-muted)]">
                        {call.durationSeconds > 0 ? formatDuration(call.durationSeconds) : '—'}
                      </span>
                      <span className="hidden shrink-0 sm:block">
                        <CallStatusBadge status={call.status} />
                      </span>
                      <OutcomeBadge outcome={call.outcome} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
