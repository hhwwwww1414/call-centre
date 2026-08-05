'use client';

import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ru } from '@/lib/i18n/ru';

/** Тексты ошибок не раскрывают, существует ли такой пользователь (ТЗ 5.2). */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: ru.auth.invalidCredentials,
  account_disabled: ru.auth.accountDisabled,
  rate_limited: ru.auth.tooManyAttempts,
  CredentialsSignin: ru.auth.invalidCredentials,
  Configuration: ru.errors.generic,
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await signIn('credentials', {
      email: email.trim(),
      password,
      redirect: false,
    });

    setPending(false);

    if (!result || result.error) {
      const code = result?.code ?? result?.error ?? 'invalid_credentials';
      setError(ERROR_MESSAGES[code] ?? ru.auth.invalidCredentials);
      return;
    }

    // Полная навигация: сессионная кука должна попасть в серверный рендер
    router.replace(next.startsWith('/') ? next : '/');
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Field label={ru.auth.email} htmlFor="login-email" required>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(error)}
          required
          autoFocus
        />
      </Field>

      <Field label={ru.auth.password} htmlFor="login-password" required>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(error)}
          required
        />
      </Field>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-[var(--destructive-soft)] px-3 py-2 text-xs text-[var(--destructive)]"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-1 w-full">
        {pending ? ru.auth.signingIn : ru.auth.signIn}
      </Button>
    </form>
  );
}
