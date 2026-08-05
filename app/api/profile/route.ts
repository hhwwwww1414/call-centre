import { handleRoute } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { profileUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();
    return { user };
  });
}

export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const current = await requireUser();
    const input = profileUpdateSchema.parse(await request.json());

    const user = await prisma.user.update({
      where: { id: current.id },
      data: {
        name: input.name,
        phone: input.phone ?? null,
        timezone: input.timezone,
        theme: input.theme,
        soundNotifications: input.soundNotifications,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        theme: true,
        timezone: true,
        soundNotifications: true,
      },
    });

    await writeAudit({
      actorId: current.id,
      action: 'profile.update',
      entityType: 'User',
      entityId: current.id,
    });

    return { user };
  });
}
