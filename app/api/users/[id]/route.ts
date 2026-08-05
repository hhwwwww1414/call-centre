import { Role } from '@prisma/client';

import { badRequest, handleRoute, notFound } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { ru } from '@/lib/i18n/ru';
import { assertUnique, isLastActiveAdmin, USER_LIST_SELECT } from '@/lib/services/users';
import { userUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const input = userUpdateSchema.parse(await request.json());

    const target = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, role: true, isActive: true, extension: true },
    });
    if (!target) throw notFound('Пользователь не найден');

    if (id === admin.id && input.isActive === false) {
      throw badRequest(ru.users.cannotDisableSelf);
    }
    if (id === admin.id && input.role && input.role !== admin.role) {
      throw badRequest(ru.users.cannotChangeOwnRole);
    }

    // Нельзя случайно остаться без единственного администратора
    if ((input.isActive === false || (input.role && input.role !== Role.ADMIN)) && target.role === Role.ADMIN) {
      const admins = await prisma.user.findMany({
        where: { deletedAt: null, role: Role.ADMIN },
        select: { id: true, role: true, isActive: true },
      });
      if (isLastActiveAdmin(admins, id)) {
        throw badRequest('Это последний активный администратор — сначала назначьте другого');
      }
    }

    await assertUnique({ extension: input.extension ?? null, excludeUserId: id });

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.extension !== undefined ? { extension: input.extension } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: USER_LIST_SELECT,
    });

    if (input.isActive !== undefined && input.isActive !== target.isActive) {
      await writeAudit({
        actorId: admin.id,
        action: input.isActive ? 'user.activate' : 'user.deactivate',
        entityType: 'User',
        entityId: id,
        meta: { email: target.email },
      });
    } else {
      await writeAudit({
        actorId: admin.id,
        action: 'user.update',
        entityType: 'User',
        entityId: id,
        meta: { email: target.email, role: user.role },
      });
    }

    return user;
  });
}

/** Мягкое удаление: звонки остаются в истории и в статистике (ТЗ 3.3). */
export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await params;

    if (id === admin.id) throw badRequest(ru.users.cannotDisableSelf);

    const target = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, role: true },
    });
    if (!target) throw notFound('Пользователь не найден');

    const admins = await prisma.user.findMany({
      where: { deletedAt: null, role: Role.ADMIN },
      select: { id: true, role: true, isActive: true },
    });
    if (target.role === Role.ADMIN && isLastActiveAdmin(admins, id)) {
      throw badRequest('Это последний активный администратор — сначала назначьте другого');
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    await writeAudit({
      actorId: admin.id,
      action: 'user.deactivate',
      entityType: 'User',
      entityId: id,
      meta: { email: target.email, soft: true },
    });

    return { ok: true };
  });
}
