'use client';

import { useMutation } from '@tanstack/react-query';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { apiFetch, ApiRequestError } from '@/lib/client/api';
import { ru } from '@/lib/i18n/ru';

/** Менеджер задаёт пароль по ссылке и сразу попадает внутрь (ТЗ 3.3). */
export function InviteForm({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  name: string;
}) {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [repeatPassword, setRepeatPassword] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const accept = useMutation({
    mutationFn: () =>
      apiFetch(`/api/invite/${token}`, {
        method: 'POST',
        body: JSON.stringify({ password, repeatPassword }),
      }),
    onSuccess: async () => {
      // Пароль только что задан — входим им же, чтобы не просить вводить дважды
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result && !result.error) {
        router.replace('/');
        router.refresh();
        return;
      }
      toast.success(ru.auth.inviteAccepted);
      router.replace('/login');
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.fields) setErrors(error.fields);
      else toast.error(error instanceof Error ? error.message : ru.errors.generic);
    },
  });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setErrors({});
        if (password !== repeatPassword) {
          setErrors({ repeatPassword: ru.auth.passwordsDoNotMatch });
          return;
        }
        accept.mutate();
      }}
    >
      <div className="rounded-md bg-[var(--surface-2)] px-3 py-2.5">
        <p className="text-xs font-medium text-[var(--foreground)]">{name}</p>
        <p className="text-2xs text-[var(--text-muted)]">{email}</p>
      </div>

      <Field
        label={ru.auth.newPassword}
        htmlFor="invite-password"
        required
        error={errors.password}
        hint={ru.auth.passwordTooShort}
      >
        <Input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoFocus
        />
      </Field>

      <Field
        label={ru.auth.repeatPassword}
        htmlFor="invite-repeat"
        required
        error={errors.repeatPassword}
      >
        <Input
          id="invite-repeat"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={repeatPassword}
          onChange={(event) => setRepeatPassword(event.target.value)}
          required
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" loading={accept.isPending} className="mt-1 w-full">
        {ru.common.save}
      </Button>
    </form>
  );
}
