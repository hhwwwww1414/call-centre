'use client';

import { AlertTriangle } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { ru } from '@/lib/i18n/ru';

/** Технические коды пользователю не показываем — только что делать (ТЗ 2.6). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        icon={<AlertTriangle className="size-5" aria-hidden />}
        title={ru.errors.generic}
        hint={ru.errors.genericHint}
        action={
          <Button variant="secondary" size="sm" onClick={reset}>
            {ru.common.retry}
          </Button>
        }
      />
    </main>
  );
}
