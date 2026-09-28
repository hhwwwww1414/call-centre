'use client';

import { Role } from '@prisma/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Mail, MoreHorizontal, Pencil, UserPlus, Users } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, Input } from '@/components/ui/field';
import { Avatar, EmptyState, TableSkeleton } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch, ApiRequestError } from '@/lib/client/api';
import { useCopy, useUsers } from '@/lib/client/hooks';
import type { AccessResult, UserRow } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { formatInZone } from '@/lib/time';
import { cn } from '@/lib/utils';

export function UsersScreen({
  timezone,
  currentUserId,
}: {
  timezone: string;
  currentUserId: string;
}) {
  const { data, isLoading, isError, refetch } = useUsers();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [access, setAccess] = React.useState<{ user: string; access: AccessResult } | null>(null);
  const [editing, setEditing] = React.useState<UserRow | null>(null);

  const users = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">{ru.users.subtitle}</p>
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus aria-hidden />
          {ru.users.create}
        </Button>
      </div>

      <Card className="overflow-hidden max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        {isLoading ? (
          <TableSkeleton rows={5} columns={6} />
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
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" aria-hidden />}
            title={ru.users.empty}
            hint={ru.users.emptyHint}
            action={
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                {ru.users.create}
              </Button>
            }
          />
        ) : (
          <UsersTable
            users={users}
            timezone={timezone}
            currentUserId={currentUserId}
            onAccessIssued={setAccess}
            onEdit={setEditing}
          />
        )}
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(name, result) => {
          setCreateOpen(false);
          setAccess({ user: name, access: result });
        }}
      />

      <AccessDialog value={access} onClose={() => setAccess(null)} />

      <EditUserDialog
        user={editing}
        isSelf={editing?.id === currentUserId}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function UsersTable({
  users,
  timezone,
  currentUserId,
  onAccessIssued,
  onEdit,
}: {
  users: UserRow[];
  timezone: string;
  currentUserId: string;
  onAccessIssued: (value: { user: string; access: AccessResult }) => void;
  onEdit: (user: UserRow) => void;
}) {
  const queryClient = useQueryClient();

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : ru.errors.saveFailed),
  });

  const issueAccess = useMutation({
    mutationFn: ({ id, method }: { id: string; method: 'invite' | 'password' }) =>
      apiFetch<{ access: AccessResult }>(`/api/users/${id}/access`, {
        method: 'POST',
        body: JSON.stringify({ method }),
      }),
    onError: (error) => toast.error(error instanceof Error ? error.message : ru.errors.saveFailed),
  });

  const rowActions = (user: UserRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={ru.common.actions}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onEdit(user)}>
          <Pencil aria-hidden />
          {ru.common.edit}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            issueAccess.mutate(
              { id: user.id, method: 'invite' },
              { onSuccess: (result) => onAccessIssued({ user: user.name, access: result.access }) },
            )
          }
        >
          <Mail aria-hidden />
          {ru.users.resendInvite}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            issueAccess.mutate(
              { id: user.id, method: 'password' },
              { onSuccess: (result) => onAccessIssued({ user: user.name, access: result.access }) },
            )
          }
        >
          <KeyRound aria-hidden />
          {ru.users.resetPassword}
        </DropdownMenuItem>
        {user.id !== currentUserId ? (
          <DropdownMenuItem
            destructive={user.isActive}
            onSelect={() => toggleActive.mutate({ id: user.id, isActive: !user.isActive })}
          >
            {user.isActive ? ru.users.deactivate : ru.users.activate}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-2xs border-b border-[var(--border)] text-left text-[var(--text-muted)]">
              <th scope="col" className="px-3 py-2.5 font-medium">
                {ru.users.columnName}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {ru.users.columnRole}
              </th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">
                {ru.users.columnExtension}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {ru.users.columnStatus}
              </th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">
                {ru.users.columnLastLogin}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {ru.users.columnCalls30d}
              </th>
              <th scope="col" className="px-3 py-2.5">
                <span className="sr-only">{ru.common.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={user.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--foreground)]">{user.name}</p>
                      <p className="text-2xs truncate text-[var(--text-muted)]">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={user.role === Role.ADMIN ? 'brand' : 'neutral'}>
                    {ru.roles[user.role]}
                  </Badge>
                </td>
                <td className="numeric hidden px-3 py-2.5 text-[var(--text-secondary)] lg:table-cell">
                  {user.extension ?? '—'}
                  {user.personalNumber ? (
                    <span className="text-2xs block text-[var(--text-muted)]">
                      {formatPhone(user.personalNumber)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={user.isActive ? 'success' : 'outline'}>
                    {user.isActive ? ru.users.statusActive : ru.users.statusDisabled}
                  </Badge>
                </td>
                <td className="numeric hidden px-3 py-2.5 whitespace-nowrap text-[var(--text-muted)] xl:table-cell">
                  {user.lastLoginAt
                    ? formatInZone(user.lastLoginAt, timezone, 'datetime')
                    : ru.common.never}
                </td>
                <td className="numeric px-3 py-2.5 text-right text-[var(--foreground)]">
                  {user.calls30d}
                </td>
                <td className="px-3 py-2.5 text-right">{rowActions(user)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {users.map((user) => (
          <li key={user.id} className="surface-card flex items-center gap-3 p-3">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--foreground)]">{user.name}</p>
              <p className="text-2xs truncate text-[var(--text-muted)]">{user.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone={user.role === Role.ADMIN ? 'brand' : 'neutral'}>
                  {ru.roles[user.role]}
                </Badge>
                <Badge tone={user.isActive ? 'success' : 'outline'}>
                  {user.isActive ? ru.users.statusActive : ru.users.statusDisabled}
                </Badge>
                {user.extension ? (
                  <span className="numeric text-2xs text-[var(--text-muted)]">
                    доб. {user.extension}
                  </span>
                ) : null}
              </div>
            </div>
            {rowActions(user)}
          </li>
        ))}
      </ul>
    </>
  );
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  extension: '',
  personalNumber: '',
  role: Role.MANAGER as Role,
  timezone: 'Europe/Moscow',
  accessMethod: 'invite' as 'invite' | 'password',
};

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string, access: AccessResult) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setErrors({});
    }
  }, [open]);

  const create = useMutation({
    mutationFn: (input: typeof EMPTY_FORM) =>
      apiFetch<{ user: UserRow; access: AccessResult }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          phone: input.phone || undefined,
          extension: input.extension || undefined,
          personalNumber: input.personalNumber || undefined,
        }),
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(ru.users.inviteCreated);
      onCreated(result.user.name, result.access);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError) {
        setErrors(error.fields ?? {});
        if (!error.fields) toast.error(error.message);
      } else {
        toast.error(ru.errors.saveFailed);
      }
    },
  });

  const set = (patch: Partial<typeof EMPTY_FORM>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ru.users.create}</DialogTitle>
          <DialogDescription>{ru.users.createHint}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setErrors({});
            create.mutate(form);
          }}
        >
          <DialogBody className="flex flex-col gap-3">
            <Field label={ru.users.fullName} htmlFor="user-name" required error={errors.name}>
              <Input
                id="user-name"
                value={form.name}
                onChange={(event) => set({ name: event.target.value })}
                autoComplete="off"
                required
              />
            </Field>

            <Field label={ru.users.email} htmlFor="user-email" required error={errors.email}>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(event) => set({ email: event.target.value })}
                autoComplete="off"
                inputMode="email"
                required
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={ru.users.phone} htmlFor="user-phone" error={errors.phone}>
                <Input
                  id="user-phone"
                  value={form.phone}
                  onChange={(event) => set({ phone: event.target.value })}
                  inputMode="tel"
                  placeholder="+7 999 123-45-67"
                />
              </Field>

              <Field
                label={ru.users.extension}
                htmlFor="user-extension"
                hint={ru.users.extensionHint}
                error={errors.extension}
              >
                <Input
                  id="user-extension"
                  value={form.extension}
                  onChange={(event) => set({ extension: event.target.value })}
                  inputMode="numeric"
                  placeholder="101"
                />
              </Field>
            </div>

            <Field
              label={ru.users.personalNumber}
              htmlFor="user-personal"
              hint={ru.users.personalNumberHint}
              error={errors.personalNumber}
            >
              <Input
                id="user-personal"
                value={form.personalNumber}
                onChange={(event) => set({ personalNumber: event.target.value })}
                inputMode="tel"
                placeholder="+7 495 123-45-67"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={ru.users.role} htmlFor="user-role">
                <Select value={form.role} onValueChange={(value) => set({ role: value as Role })}>
                  <SelectTrigger id="user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* SUPERVISOR заведён в схеме, но в UI пока не выводится (ТЗ 3.1) */}
                    <SelectItem value={Role.MANAGER}>{ru.roles.MANAGER}</SelectItem>
                    <SelectItem value={Role.ADMIN}>{ru.roles.ADMIN}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label={ru.users.timezone} htmlFor="user-timezone">
                <Select value={form.timezone} onValueChange={(value) => set({ timezone: value })}>
                  <SelectTrigger id="user-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ru.timezones.map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Как выдать доступ" htmlFor="user-access">
              <Select
                value={form.accessMethod}
                onValueChange={(value) => set({ accessMethod: value as 'invite' | 'password' })}
              >
                <SelectTrigger id="user-access">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invite">Ссылка-приглашение на 72 часа</SelectItem>
                  <SelectItem value="password">Одноразовый пароль</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {ru.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {ru.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Правка сотрудника: добавочный и личный номер нужны, чтобы АТС и CRM
 * узнавали его звонки. Пустое поле — очистить значение.
 */
function EditUserDialog({
  user,
  isSelf,
  onClose,
}: {
  user: UserRow | null;
  isSelf: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    name: '',
    extension: '',
    personalNumber: '',
    role: Role.MANAGER as Role,
    timezone: 'Europe/Moscow',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      extension: user.extension ?? '',
      personalNumber: user.personalNumber ?? '',
      role: user.role,
      timezone: user.timezone,
    });
    setErrors({});
  }, [user]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/users/${user?.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          extension: form.extension.trim() || null,
          personalNumber: form.personalNumber.trim() || null,
          timezone: form.timezone,
          ...(isSelf ? {} : { role: form.role }),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(ru.common.saved);
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError) {
        setErrors(error.fields ?? {});
        if (!error.fields) toast.error(error.message);
      } else {
        toast.error(ru.errors.saveFailed);
      }
    },
  });

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user?.name}</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setErrors({});
            save.mutate();
          }}
        >
          <DialogBody className="flex flex-col gap-3">
            <Field label={ru.users.fullName} htmlFor="edit-name" required error={errors.name}>
              <Input
                id="edit-name"
                value={form.name}
                onChange={(event) => set({ name: event.target.value })}
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={ru.users.extension}
                htmlFor="edit-extension"
                hint={ru.users.extensionHint}
                error={errors.extension}
              >
                <Input
                  id="edit-extension"
                  value={form.extension}
                  onChange={(event) => set({ extension: event.target.value })}
                  inputMode="numeric"
                  placeholder="201"
                />
              </Field>
              <Field
                label={ru.users.personalNumber}
                htmlFor="edit-personal"
                hint={ru.users.personalNumberHint}
                error={errors.personalNumber}
              >
                <Input
                  id="edit-personal"
                  value={form.personalNumber}
                  onChange={(event) => set({ personalNumber: event.target.value })}
                  inputMode="tel"
                  placeholder="+7 495 123-45-67"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={ru.users.role} htmlFor="edit-role">
                <Select
                  value={form.role}
                  onValueChange={(value) => set({ role: value as Role })}
                  disabled={isSelf}
                >
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Role.MANAGER}>{ru.roles.MANAGER}</SelectItem>
                    <SelectItem value={Role.ADMIN}>{ru.roles.ADMIN}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={ru.users.timezone} htmlFor="edit-timezone">
                <Select value={form.timezone} onValueChange={(value) => set({ timezone: value })}>
                  <SelectTrigger id="edit-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ru.timezones.map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {ru.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {ru.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Ссылка-приглашение показывается один раз — дальше её уже не восстановить. */
function AccessDialog({
  value,
  onClose,
}: {
  value: { user: string; access: AccessResult } | null;
  onClose: () => void;
}) {
  const { copied, copy } = useCopy();
  if (!value) return null;

  const secret =
    value.access.method === 'invite' ? value.access.inviteUrl : value.access.oneTimePassword;
  const title = value.access.method === 'invite' ? ru.users.inviteLink : ru.users.oneTimePassword;
  const hint =
    value.access.method === 'invite' ? ru.users.inviteLinkHint : ru.users.oneTimePasswordHint;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {value.user} · {hint}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 rounded-md bg-[var(--surface-2)] px-3 py-2.5 text-xs break-all text-[var(--foreground)] select-all">
              {secret}
            </code>
            <Button
              variant={copied ? 'primary' : 'secondary'}
              size="icon"
              onClick={() => void copy(secret)}
              aria-label={ru.common.copy}
              className="shrink-0"
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
          <p
            className={cn('text-2xs', copied ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]')}
          >
            {copied ? ru.common.copied : hint}
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            {ru.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
