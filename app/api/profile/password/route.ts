import { badRequest, handleRoute } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { ru } from '@/lib/i18n/ru';
import { changePasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleRoute(async () => {
    const current = await requireUser();
    const input = changePasswordSchema.parse(await request.json());

    const record = await prisma.user.findUnique({
      where: { id: current.id },
      select: { passwordHash: true, mustChangePassword: true },
    });

    // Текущий пароль спрашиваем всегда, кроме принудительной смены стартового
    if (record?.passwordHash && !record.mustChangePassword) {
      if (!input.currentPassword) {
        throw badRequest(ru.auth.currentPasswordWrong, {
          currentPassword: 'Укажите текущий пароль',
        });
      }
      const ok = await verifyPassword(record.passwordHash, input.currentPassword);
      if (!ok) {
        throw badRequest(ru.auth.currentPasswordWrong, {
          currentPassword: ru.auth.currentPasswordWrong,
        });
      }
    }

    await prisma.user.update({
      where: { id: current.id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        mustChangePassword: false,
      },
    });

    await writeAudit({
      actorId: current.id,
      action: 'user.password.change',
      entityType: 'User',
      entityId: current.id,
    });

    return { ok: true };
  });
}
