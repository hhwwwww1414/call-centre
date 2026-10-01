'use client';

import type { Role } from '@prisma/client';
import { Ban, Plus, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { DirectionIcon } from '@/components/calls/call-presentation';
import { ContactCreateDialog } from '@/components/contacts/contact-create-dialog';
import {
  clearListPosition,
  readListPosition,
  restoreScroll,
  saveListPosition,
} from '@/components/contacts/list-position';
import {
  MarketplaceTag,
  moderationNameClass,
  SEGMENT_LABEL,
} from '@/components/contacts/marketplace-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Avatar, EmptyState, Switch, TableSkeleton } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useContacts, useDebounced, useTaskAssignees } from '@/lib/client/hooks';
import type { ContactRow } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { cn, pluralWithCount } from '@/lib/utils';

const ALL_OWNERS = '__all__';
const ALL_SEGMENTS = '__all__';

export function ContactsScreen({ timezone, role }: { timezone: string; role: Role }) {
  const canAssign = role === 'ADMIN' || role === 'SUPERVISOR';
  const router = useRouter();
  const query = useSearchParams();
  // Фильтры живут в адресе: «Назад» из карточки клиента возвращает тот же список
  const [search, setSearch] = React.useState(query.get('q') ?? '');
  const [onlyBlocked, setOnlyBlocked] = React.useState(query.get('blocked') === '1');
  const [owner, setOwner] = React.useState(query.get('owner') ?? ALL_OWNERS);
  const [segment, setSegment] = React.useState(query.get('segment') ?? ALL_SEGMENTS);
  const debounced = useDebounced(search);
  const assignees = useTaskAssignees(canAssign);
  const [createOpen, setCreateOpen] = React.useState(false);

  const params = React.useMemo(
    () => ({
      search: debounced.trim() || undefined,
      onlyBlocked: onlyBlocked || undefined,
      owner: owner === ALL_OWNERS ? undefined : owner,
      segment: segment === ALL_SEGMENTS ? undefined : segment,
      limit: 50,
    }),
    [debounced, onlyBlocked, owner, segment],
  );

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useContacts(params);

  const contacts = data?.pages.flatMap((page) => page.items) ?? [];

  const listUrl = React.useMemo(() => {
    const next = new URLSearchParams();
    if (debounced.trim()) next.set('q', debounced.trim());
    if (onlyBlocked) next.set('blocked', '1');
    if (owner !== ALL_OWNERS) next.set('owner', owner);
    if (segment !== ALL_SEGMENTS) next.set('segment', segment);
    const qs = next.toString();
    return qs ? `/contacts?${qs}` : '/contacts';
  }, [debounced, onlyBlocked, owner, segment]);

  React.useEffect(() => {
    if (window.location.pathname + window.location.search !== listUrl) {
      router.replace(listUrl, { scroll: false });
    }
  }, [listUrl, router]);

  const openContact = (id: string) => {
    saveListPosition(listUrl, contacts.length, id);
    router.push(`/contacts/${id}`);
  };

  // Вернулись из карточки клиента — догружаем те же страницы и встаём на место
  const restoredRef = React.useRef(false);
  React.useEffect(() => {
    if (restoredRef.current || isLoading) return;
    const saved = readListPosition();
    if (!saved || saved.url !== listUrl) {
      restoredRef.current = true;
      return;
    }
    if (contacts.length < saved.rows && hasNextPage) {
      if (!isFetchingNextPage) void fetchNextPage();
      return;
    }
    restoredRef.current = true;
    clearListPosition();
    requestAnimationFrame(() => restoreScroll(saved.y));
  }, [contacts.length, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, listUrl]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={ru.contacts.searchPlaceholder}
          aria-label={ru.common.search}
          inputMode="search"
          className="max-w-xs flex-1"
        />
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-full sm:w-56" aria-label={ru.contacts.filterOwner}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OWNERS}>{ru.contacts.ownerAll}</SelectItem>
            <SelectItem value="me">{ru.contacts.ownerMine}</SelectItem>
            <SelectItem value="none">{ru.contacts.ownerNobody}</SelectItem>
            {canAssign
              ? (assignees.data?.items ?? []).map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))
              : null}
          </SelectContent>
        </Select>
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Сегмент vin2win">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SEGMENTS}>Все клиенты</SelectItem>
            {Object.entries(SEGMENT_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex min-h-11 items-center gap-2 text-xs text-[var(--text-secondary)] md:min-h-0">
          <Switch
            checked={onlyBlocked}
            onCheckedChange={setOnlyBlocked}
            aria-label={ru.contacts.blocked}
          />
          {ru.contacts.blocked}
        </label>
        <Button
          variant="primary"
          className="ml-auto max-sm:w-full"
          onClick={() => setCreateOpen(true)}
        >
          <Plus aria-hidden />
          Новый контакт
        </Button>
      </div>
      <ContactCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Card className="overflow-hidden max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        {isLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : isError ? (
          <EmptyState
            title={ru.errors.loadFailed}
            hint={ru.errors.genericHint}
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                {ru.common.retry}
              </Button>
            }
          />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" aria-hidden />}
            title={ru.contacts.empty}
            hint={ru.contacts.emptyHint}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-2xs border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {ru.contacts.columnName}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {ru.contacts.columnPhone}
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">
                      {ru.contacts.columnCompany}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {ru.contacts.columnOwner}
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">
                      {ru.contacts.columnNote}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      {ru.contacts.columnCalls}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {ru.contacts.columnLastCall}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr
                      key={contact.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => openContact(contact.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openContact(contact.id);
                        }
                      }}
                      className="cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--surface)]"
                    >
                      <td className="max-w-52 px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={contact.name ?? contact.company ?? '?'} size="sm" />
                          <span className="flex min-w-0 flex-col">
                            <span
                              className={cn(
                                'truncate font-medium',
                                moderationNameClass(contact.marketplace) ??
                                  'text-[var(--foreground)]',
                              )}
                            >
                              {contact.name || contact.company || 'Без имени'}
                            </span>
                            <MarketplaceTag account={contact.marketplace} />
                          </span>
                          {contact.isBlocked ? (
                            <Badge tone="danger">
                              <Ban className="size-3" aria-hidden />
                              {ru.contacts.blocked}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="numeric px-3 py-2.5 whitespace-nowrap text-[var(--text-secondary)]">
                        {formatPhone(contact.phoneE164)}
                      </td>
                      <td className="hidden max-w-40 truncate px-3 py-2.5 text-[var(--text-secondary)] lg:table-cell">
                        {contact.company ?? '—'}
                      </td>
                      <td className="max-w-40 truncate px-3 py-2.5 text-[var(--text-secondary)]">
                        {contact.owner?.name ?? (
                          <span className="text-[var(--text-muted)]">{ru.contacts.ownerNone}</span>
                        )}
                      </td>
                      <td className="hidden max-w-64 truncate px-3 py-2.5 text-[var(--text-muted)] xl:table-cell">
                        {contact.note ?? '—'}
                      </td>
                      <td className="numeric px-3 py-2.5 text-right text-[var(--foreground)]">
                        {contact.callsCount}
                      </td>
                      <td className="numeric px-3 py-2.5 whitespace-nowrap text-[var(--text-muted)]">
                        {contact.lastCall
                          ? formatInZone(contact.lastCall.startedAt, timezone, 'datetime')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2 md:hidden">
              {contacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  timezone={timezone}
                  onOpen={() => openContact(contact.id)}
                />
              ))}
            </ul>

            {hasNextPage ? (
              <div className="flex justify-center px-3 py-3">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {ru.calls.loadMore}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

function ContactCard({
  contact,
  timezone,
  onOpen,
}: {
  contact: ContactRow;
  timezone: string;
  onOpen: () => void;
}) {
  return (
    <li className="surface-card">
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1.5 p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span
              className={cn(
                'block truncate text-sm font-medium',
                moderationNameClass(contact.marketplace) ?? 'text-[var(--foreground)]',
              )}
            >
              {contact.name ?? formatPhone(contact.phoneE164)}
            </span>
            {contact.name ? (
              <span className="numeric text-2xs block truncate text-[var(--text-muted)]">
                {formatPhone(contact.phoneE164)}
              </span>
            ) : null}
            <MarketplaceTag account={contact.marketplace} className="mt-0.5" />
          </span>
          {contact.isBlocked ? (
            <Badge tone="danger">
              <Ban className="size-3" aria-hidden />
            </Badge>
          ) : null}
        </div>

        <div className="text-2xs flex items-center gap-2 text-[var(--text-muted)]">
          {contact.lastCall ? (
            <>
              <DirectionIcon
                direction={contact.lastCall.direction}
                status={contact.lastCall.status}
                className="size-3"
              />
              <span className="numeric">
                {formatInZone(contact.lastCall.startedAt, timezone, 'short')}
              </span>
              <span>·</span>
            </>
          ) : null}
          <span>{pluralWithCount(contact.callsCount, 'звонок', 'звонка', 'звонков')}</span>
        </div>
      </button>
    </li>
  );
}
