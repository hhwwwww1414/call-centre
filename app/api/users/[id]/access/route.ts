import { badRequest, handleRoute, notFound } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/rbac';
import { appUrl } from '@/lib/config';
import { prisma } from '@/lib/db';
import { createInvite, issueOneTimePassword, type CreatedAccess } from '@/lib/services/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Повторная выдача доступа: ссылка-приглашение (основной путь) или
 * одноразовый пароль (запасной, если почта не настроена) — ТЗ 3.3.
 */
export async function POST(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as { method?: string };
    const method = body.method === 'password' ? 'password' : 'invite';

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, isActive: true },
    });
    if (!user) throw notFound('Пользователь не найден');
    if (!user.isActive) throw badRequest('Сначала откройте доступ этому сотруднику');

    let access: CreatedAccess;
    if (method === 'password') {
      access = { method: 'password', oneTimePassword: await issueOneTimePassword(id) };
      await writeAudit({
        actorId: admin.id,
        action: 'user.password.reset',
        entityType: 'User',
        entityId: id,
        meta: { email: user.email },
      });
    } else {
      const invite = await createInvite(id, appUrl());
      access = { method: 'invite', ...invite };
      await writeAudit({
        actorId: admin.id,
        action: 'user.invite.create',
        entityType: 'User',
        entityId: id,
        meta: { email: user.email, resent: true },
      });
    }

    return { access };
  });
}
