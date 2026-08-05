import { Role } from '@prisma/client';
import { forbidden, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { canSeeAllCalls, callScopeFilter, isAdmin, type SessionUser } from '@/lib/auth/scope';
import { prisma } from '@/lib/db';

// Правила видимости живут в lib/auth/scope.ts — там же они и тестируются
export { canSeeAllCalls, callScopeFilter, isAdmin };
export type { SessionUser };

export class AuthError extends Error {
  constructor(
    override readonly message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Единственная точка проверки прав (ТЗ 3.2). Вызывается в каждом
 * server action и API-роуте. Нет вызова — нет роута.
 *
 * Роль берётся не из токена, а из БД: деактивация должна закрывать доступ
 * немедленно, не дожидаясь протухания JWT.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError('Требуется вход', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      deletedAt: true,
      mustChangePassword: true,
      theme: true,
      timezone: true,
      extension: true,
      soundNotifications: true,
    },
  });

  if (!user || !user.isActive || user.deletedAt) {
    throw new AuthError('Доступ к аккаунту закрыт', 401);
  }

  const { isActive: _isActive, deletedAt: _deletedAt, ...rest } = user;
  return rest;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new AuthError('Недостаточно прав', 403);
  }
  return user;
}

export const requireAdmin = () => requireRole(Role.ADMIN);

/** Версии для страниц: вместо исключения — редирект/403-страница Next. */
export async function requireUserPage(): Promise<SessionUser> {
  try {
    return await requireUser();
  } catch {
    redirect('/login');
  }
}

export async function requireRolePage(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUserPage();
  if (roles.length > 0 && !roles.includes(user.role)) {
    forbidden();
  }
  return user;
}
