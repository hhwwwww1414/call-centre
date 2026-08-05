import { prisma } from '@/lib/db';

/** ТЗ 3.4: 5 попыток за 15 минут на связку IP + логин, дальше блок на 15 минут. */
export const MAX_ATTEMPTS = 5;
export const WINDOW_MINUTES = 15;

export type RateLimitVerdict = {
  blocked: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function checkLoginRateLimit(ip: string, email: string): Promise<RateLimitVerdict> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const attempts = await prisma.loginAttempt.findMany({
    where: {
      ip,
      email: email.toLowerCase(),
      success: false,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  if (attempts.length < MAX_ATTEMPTS) {
    return { blocked: false, remaining: MAX_ATTEMPTS - attempts.length, retryAfterSeconds: 0 };
  }

  // Блокировка снимается через 15 минут после самой ранней попытки в окне
  const oldest = attempts[0]?.createdAt ?? since;
  const unblockAt = oldest.getTime() + WINDOW_MINUTES * 60_000;
  const retryAfterSeconds = Math.max(1, Math.ceil((unblockAt - Date.now()) / 1000));

  return { blocked: true, remaining: 0, retryAfterSeconds };
}

export async function recordLoginAttempt(
  ip: string,
  email: string,
  success: boolean,
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { ip, email: email.toLowerCase(), success },
  });

  if (success) {
    // Успешный вход обнуляет счётчик для этой связки
    await prisma.loginAttempt.deleteMany({
      where: { ip, email: email.toLowerCase(), success: false },
    });
  }
}

/** Чистка старых записей — вызывается из вебхука health/cron, чтобы таблица не росла. */
export async function pruneLoginAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  const { count } = await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
