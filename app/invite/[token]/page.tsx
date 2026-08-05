import type { Metadata } from 'next';
import Link from 'next/link';

import { InviteForm } from '@/components/auth/invite-form';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { hashToken } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { ru } from '@/lib/i18n/ru';

export const metadata: Metadata = { title: ru.auth.inviteTitle };
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      usedAt: true,
      user: { select: { name: true, email: true, isActive: true, deletedAt: true } },
    },
  });

  const valid =
    invite &&
    !invite.usedAt &&
    invite.expiresAt > new Date() &&
    invite.user.isActive &&
    !invite.user.deletedAt;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--page)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-4 text-center">
          <Logo width={148} priority />
          <div>
            <h1 className="display-heading text-lg text-[var(--foreground)]">
              {valid ? ru.auth.inviteTitle : ru.auth.inviteInvalid}
            </h1>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {valid ? ru.auth.inviteSubtitle : ru.auth.inviteInvalidHint}
            </p>
          </div>
        </div>

        <div className="surface-card p-5">
          {valid ? (
            <InviteForm token={token} email={invite.user.email} name={invite.user.name} />
          ) : (
            <Button variant="secondary" className="w-full" asChild>
              <Link href="/login">{ru.auth.signIn}</Link>
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
