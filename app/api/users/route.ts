import { handleRoute } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import {
  assertUnique,
  callCountsLast30Days,
  createInvite,
  issueOneTimePassword,
  USER_LIST_SELECT,
  type CreatedAccess,
} from '@/lib/services/users';
import { appUrl } from '@/lib/config';
import { userCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handleRoute(async () => {
    await requireAdmin();

    const [users, callCounts] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: null },
        select: USER_LIST_SELECT,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      callCountsLast30Days(),
    ]);

    return {
      items: users.map((user) => ({ ...user, calls30d: callCounts.get(user.id) ?? 0 })),
    };
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    const input = userCreateSchema.parse(await request.json());

    await assertUnique({
      email: input.email,
      extension: input.extension ?? null,
      personalNumber: input.personalNumber ?? null,
    });

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        extension: input.extension ?? null,
        personalNumber: input.personalNumber ?? null,
        role: input.role,
        timezone: input.timezone,
        createdById: admin.id,
        // Пароля нет до принятия приглашения — войти по пустому нельзя
        passwordHash: null,
      },
      select: USER_LIST_SELECT,
    });

    let access: CreatedAccess;
    if (input.accessMethod === 'password') {
      access = { method: 'password', oneTimePassword: await issueOneTimePassword(user.id) };
    } else {
      const invite = await createInvite(user.id, appUrl());
      access = { method: 'invite', ...invite };
      await writeAudit({
        actorId: admin.id,
        action: 'user.invite.create',
        entityType: 'User',
        entityId: user.id,
      });
    }

    await writeAudit({
      actorId: admin.id,
      action: 'user.create',
      entityType: 'User',
      entityId: user.id,
      meta: { email: user.email, role: user.role, accessMethod: input.accessMethod },
    });

    return { user: { ...user, calls30d: 0 }, access };
  });
}
