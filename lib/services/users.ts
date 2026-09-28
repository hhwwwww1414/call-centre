import { type Prisma, Role } from '@prisma/client';

import { conflict } from '@/lib/api';
import { generateOneTimePassword, hashPassword } from '@/lib/auth/password';
import { generateToken, hashToken } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { ru } from '@/lib/i18n/ru';

/** Ссылка-приглашение живёт 72 часа (ТЗ 3.3). */
export const INVITE_TTL_HOURS = 72;

export const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  extension: true,
  personalNumber: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  timezone: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type CreatedAccess =
  | { method: 'invite'; inviteUrl: string; expiresAt: Date }
  | { method: 'password'; oneTimePassword: string };

export async function createInvite(userId: string, appUrl: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000);

  // Старые неиспользованные приглашения гасим — активной должна быть одна ссылка
  await prisma.invite.deleteMany({ where: { userId, usedAt: null } });
  await prisma.invite.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return {
    inviteUrl: `${appUrl.replace(/\/+$/, '')}/invite/${token}`,
    expiresAt,
  };
}

export async function issueOneTimePassword(userId: string): Promise<string> {
  const password = generateOneTimePassword();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  return password;
}

/** Уникальность e-mail и добавочного проверяем до записи — иначе P2002 в лицо. */
export async function assertUnique(input: {
  email?: string;
  extension?: string | null;
  personalNumber?: string | null;
  excludeUserId?: string;
}) {
  if (input.email) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing && existing.id !== input.excludeUserId) {
      throw conflict(ru.users.emailTaken, { email: ru.users.emailTaken });
    }
  }

  if (input.extension) {
    const existing = await prisma.user.findFirst({
      where: { extension: input.extension },
      select: { id: true },
    });
    if (existing && existing.id !== input.excludeUserId) {
      throw conflict(ru.users.extensionTaken, { extension: ru.users.extensionTaken });
    }
  }

  if (input.personalNumber) {
    const existing = await prisma.user.findFirst({
      where: { personalNumber: input.personalNumber },
      select: { id: true },
    });
    if (existing && existing.id !== input.excludeUserId) {
      throw conflict(ru.users.personalNumberTaken, {
        personalNumber: ru.users.personalNumberTaken,
      });
    }
  }
}

/** Звонков за 30 дней — колонка в таблице пользователей (ТЗ 5.6). */
export async function callCountsLast30Days(): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.call.groupBy({
    by: ['userId'],
    where: { startedAt: { gte: since }, userId: { not: null } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.userId ?? '', row._count._all]));
}

export function isLastActiveAdmin(
  users: { id: string; role: Role; isActive: boolean }[],
  userId: string,
) {
  const activeAdmins = users.filter((u) => u.role === Role.ADMIN && u.isActive);
  return activeAdmins.length === 1 && activeAdmins[0]?.id === userId;
}
