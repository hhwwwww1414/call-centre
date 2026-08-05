'use client';

import { useMutation } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { apiFetch, ApiRequestError } from '@/lib/client/api';
import { ru } from '@/lib/i18n/ru';

/** Смена пароля. При принудительной смене текущий пароль не спрашиваем (ТЗ 3.2). */
export function PasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const { update } = useSession();
  const [form, setForm] = React.useState({
    currentPassword: '',
    newPassword: '',
    repeatPassword: '',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = useMutation({
    mutationFn: (input: typeof form) =>
      apiFetch('/api/profile/password', {
        method: 'POST',
        body: JSON.stringify({
          ...(forced ? {} : { currentPassword: input.currentPassword }),
          newPassword: input.newPassword,
          repeatPassword: input.repeatPassword,
        }),
      }),
    onSuccess: async () => {
      toast.success(ru.profile.passwordUpdated);
      // Флаг mustChangePassword лежит в JWT-куке, и middleware читает именно её.
      // Перевыпустить куку может только роут /api/auth/session — его и дёргает
      // update(). Без этого пользователя бесконечно возвращало бы на смену пароля.
      await update();
      window.location.href = '/';
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.fields) setErrors(error.fields);
      else toast.error(error instanceof Error ? error.message : ru.errors.saveFailed);
    },
  });

  return (
    <Card className="max-w-md">
      <CardHeader>
        <div>
          <CardTitle>{forced ? ru.auth.mustChangePassword : ru.auth.changePassword}</CardTitle>
          {forced ? (
            <p className="mt-1 flex items-start gap-1.5 text-2xs text-[var(--text-muted)]">
              <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {ru.auth.mustChangePasswordHint}
            </p>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setErrors({});
            if (form.newPassword !== form.repeatPassword) {
              setErrors({ repeatPassword: ru.auth.passwordsDoNotMatch });
              return;
            }
            submit.mutate(form);
          }}
        >
          {!forced ? (
            <Field
              label={ru.auth.currentPassword}
              htmlFor="current-password"
              required
              error={errors.currentPassword}
            >
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                }
                required
              />
            </Field>
          ) : null}

          <Field
            label={ru.auth.newPassword}
            htmlFor="new-password"
            required
            error={errors.newPassword}
            hint={ru.auth.passwordTooShort}
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={form.newPassword}
              onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
              required
            />
          </Field>

          <Field
            label={ru.auth.repeatPassword}
            htmlFor="repeat-password"
            required
            error={errors.repeatPassword}
          >
            <Input
              id="repeat-password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={form.repeatPassword}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, repeatPassword: event.target.value }))
              }
              required
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={submit.isPending}>
              {ru.common.save}
            </Button>
            {!forced ? (
              <Button type="button" variant="ghost" onClick={() => router.push('/profile')}>
                {ru.common.cancel}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
