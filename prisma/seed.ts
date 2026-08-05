/**
 * Первый администратор (ТЗ 3.2). Логин и стартовый пароль берутся из .env,
 * при первом входе система обязывает сменить пароль.
 *
 *   pnpm db:seed
 */
import { PrismaClient, Role } from '@prisma/client';
import { hash } from '@node-rs/argon2';

import { ARGON2ID } from '../lib/auth/password';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Администратор';

  if (!email || !password) {
    throw new Error('Задайте SEED_ADMIN_EMAIL и SEED_ADMIN_PASSWORD в .env');
  }
  if (password.length < 10) {
    throw new Error('SEED_ADMIN_PASSWORD должен быть не короче 10 символов');
  }

  const passwordHash = await hash(password, {
    algorithm: ARGON2ID,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    // Повторный запуск сида не должен ломать боевой аккаунт: только
    // возвращаем роль и доступ, пароль не трогаем
    await prisma.user.update({
      where: { email },
      data: { role: Role.ADMIN, isActive: true, deletedAt: null },
    });
    console.log(`Администратор ${email} уже существует — доступ восстановлен, пароль не изменён.`);
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email,
      name,
      role: Role.ADMIN,
      passwordHash,
      mustChangePassword: true,
      timezone: process.env.TZ || 'Europe/Moscow',
    },
    select: { id: true, email: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: 'user.create',
      entityType: 'User',
      entityId: admin.id,
      meta: { seed: true, role: Role.ADMIN },
    },
  });

  console.log(`Создан администратор ${admin.email}. При первом входе потребуется сменить пароль.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
