/**
 * Аварийная установка пароля пользователя — когда в интерфейс войти нельзя
 * (забыт пароль единственного администратора, сломана почта).
 *
 *   pnpm exec tsx scripts/set-password.ts admin@vin2win.online 'НовыйПароль123'
 *
 * Пользователь будет обязан сменить пароль при первом входе.
 * На сервере запускается в контейнере миграций:
 *   docker compose run --rm --no-deps --entrypoint '' migrate \
 *     pnpm exec tsx scripts/set-password.ts <email> '<пароль>'
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

import { ARGON2ID } from '../lib/auth/password';

const prisma = new PrismaClient();

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    throw new Error('Использование: tsx scripts/set-password.ts <email> <пароль>');
  }
  if (password.length < 10) {
    throw new Error('Пароль должен быть не короче 10 символов');
  }

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    throw new Error(`Пользователь ${email} не найден`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hash(password, {
        algorithm: ARGON2ID,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      }),
      // Пароль передавался вручную — заставляем сменить при входе
      mustChangePassword: true,
      isActive: true,
      deletedAt: null,
    },
  });

  // Старые приглашения после ручной установки пароля бессмысленны
  await prisma.invite.deleteMany({ where: { userId: user.id, usedAt: null } });

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: 'user.password.reset',
      entityType: 'User',
      entityId: user.id,
      meta: { email: user.email, via: 'cli' },
    },
  });

  console.log(`Пароль для ${user.email} установлен. При первом входе система попросит его сменить.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
