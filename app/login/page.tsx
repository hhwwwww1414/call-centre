import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { auth } from '@/auth';
import { LoginForm } from '@/components/auth/login-form';
import { Skeleton } from '@/components/ui/misc';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.auth.signInTitle };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--page)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-[var(--brand)] text-base font-bold text-[var(--brand-foreground)]">
            V2
          </span>
          <div>
            <h1 className="display-heading text-lg text-[var(--foreground)]">
              {ru.auth.signInTitle}
            </h1>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{ru.auth.signInSubtitle}</p>
          </div>
        </div>

        <div className="surface-card p-5">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
