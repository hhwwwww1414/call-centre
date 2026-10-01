import { handleRoute, HttpError } from '@/lib/api';
import { hashPassword } from '@/lib/auth/password';
import { writeAuditRaw } from '@/lib/audit';
import { clientIp } from '@/lib/api';
import { hashToken } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { ru } from '@/lib/i18n/ru';
import { acceptInviteSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ token: string }> };

const invalidInvite = () => new HttpError(410, 'invite_invalid', ru.auth.inviteInvalidHint);

async function findLiveInvite(token: string) {
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { id: true, name: true, email: true, isActive: true, deletedAt: true } },
    },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) throw invalidInvite();
  if (!invite.user.isActive || invite.user.deletedAt) throw invalidInvite();
  return invite;
}

/** Проверка ссылки до показа формы — чтобы не заставлять вводить пароль зря. */
export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { token } = await params;
    const invite = await findLiveInvite(token);
    return {
      valid: true,
      name: invite.user.name,
      email: invite.user.email,
      expiresAt: invite.expiresAt,
    };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { token } = await params;
    const body = await request.json();
    const input = acceptInviteSchema.parse({ ...body, token });

    const invite = await findLiveInvite(input.token);

    const passwordHash = await hashPassword(input.password);
    // Ссылка одноразовая и при двух одновременных отправках: гасим её условно,
    // и пароль меняет только тот запрос, который успел первым
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalidInvite();
      await tx.user.update({
        where: { id: invite.user.id },
        data: { passwordHash, mustChangePassword: false },
      });
    });

    await writeAuditRaw({
      actorId: invite.user.id,
      action: 'user.invite.accept',
      entityType: 'User',
      entityId: invite.user.id,
      ip: clientIp(request.headers),
      userAgent: request.headers.get('user-agent')?.slice(0, 400) ?? null,
    });

    return { ok: true, email: invite.user.email };
  });
}
