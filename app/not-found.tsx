import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { ru } from '@/lib/i18n/ru';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        icon={<FileQuestion className="size-5" aria-hidden />}
        title={ru.errors.notFound}
        hint={ru.errors.notFoundHint}
        action={
          <Button variant="secondary" size="sm" asChild>
            <Link href="/">{ru.nav.dashboard}</Link>
          </Button>
        }
      />
    </main>
  );
}
