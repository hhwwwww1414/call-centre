import { handleRoute } from '@/lib/api';
import { AuthError, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { canManageTasks } from '@/lib/services/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Кому можно поставить задачу. Отдельно от /api/users: супервайзер ставит
 * задачи, но полный список аккаунтов с e-mail ему не положен.
 */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();
    if (!canManageTasks(user.role)) throw new AuthError('Недостаточно прав', 403);

    const items = await prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, extension: true, role: true },
      orderBy: [{ role: 'desc' }, { name: 'asc' }],
    });
    return { items };
  });
}
