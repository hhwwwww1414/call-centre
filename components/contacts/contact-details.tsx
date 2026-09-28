'use client';

import type { Role } from '@prisma/client';
import { ArrowLeft, Ban, ShieldCheck, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { CallButton } from '@/components/calls/call-button';
import { CallStatusBadge, DirectionIcon, OutcomeBadge } from '@/components/calls/call-presentation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Avatar, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
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
  const { data, isLoading, isError } = useContact(contactId);
  const update = useUpdateContact(contactId);

  const [form, setForm] = React.useState({ name: '', company: '', note: '' });
  const [dirty, setDirty] = React.useState(false);
  const [mobileSection, setMobileSection] = React.useState('details');

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
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="max-sm:basis-full max-sm:justify-start"
          onClick={() => router.push('/contacts')}
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

      <Tabs value={mobileSection} onValueChange={setMobileSection} className="lg:hidden">
        <TabsList className="w-full">
          <TabsTrigger value="details" className="flex-1">
            {ru.contacts.title}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            {ru.contacts.history}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className={`lg:col-span-1 ${mobileSection !== 'details' ? 'hidden lg:block' : ''}`}>
          <CardHeader>
            <CardTitle>{ru.contacts.title}</CardTitle>
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
          </CardContent>
        </Card>

        <Card className={`lg:col-span-2 ${mobileSection !== 'history' ? 'hidden lg:block' : ''}`}>
          <CardHeader>
            <div>
              <CardTitle>{ru.contacts.history}</CardTitle>
              <p className="text-2xs mt-0.5 text-[var(--text-muted)]">
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
                      className="flex flex-wrap items-center gap-3 px-4 py-4 transition-colors hover:bg-[var(--surface)] sm:px-5"
                    >
                      <DirectionIcon
                        direction={call.direction}
                        status={call.status}
                        className="shrink-0"
                      />
                      <span className="numeric min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                        {formatInZone(call.startedAt, timezone, 'datetime')}
                      </span>
                      <span className="numeric text-2xs shrink-0 text-[var(--text-muted)]">
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
      <Field label={ru.contacts.owner} htmlFor="contact-owner" hint={ru.contacts.ownerHint}>
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
      <p className="text-2xs text-[var(--text-muted)]">
        {ownerId ? ru.contacts.ownerHint : ru.contacts.ownerAuto}
      </p>
    </div>
  );
}
