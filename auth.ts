import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import { authConfig } from '@/auth.config';
import { fakeVerify, verifyPassword } from '@/lib/auth/password';
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/auth/rate-limit';
import { asAppToken } from '@/lib/auth/token';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Коды ошибок входа. В UI превращаются в человеческий текст. */
export class InvalidCredentialsError extends CredentialsSignin {
  override code = 'invalid_credentials';
}
export class AccountDisabledError extends CredentialsSignin {
  override code = 'account_disabled';
}
export class RateLimitedError extends CredentialsSignin {
  override code = 'rate_limited';
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  ip: z.string().default('unknown'),
});

/** Данные пользователя протухают в токене за 60 секунд — блокировка срабатывает почти сразу. */
const TOKEN_REFRESH_MS = 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Пароль', type: 'password' },
        ip: { type: 'text' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentialsError();

        const email = parsed.data.email.trim().toLowerCase();
        const { password, ip } = parsed.data;

        const limit = await checkLoginRateLimit(ip, email);
        if (limit.blocked) {
          logger.warn({ ip, email, retryAfterSeconds: limit.retryAfterSeconds }, 'login rate limited');
          throw new RateLimitedError();
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            passwordHash: true,
            isActive: true,
            deletedAt: true,
            mustChangePassword: true,
            theme: true,
            timezone: true,
            extension: true,
            soundNotifications: true,
          },
        });

        if (!user || !user.passwordHash) {
          // Всё равно считаем хеш — чтобы по времени ответа нельзя было
          // определить, существует ли такой логин
          await fakeVerify(password);
          await recordLoginAttempt(ip, email, false);
          throw new InvalidCredentialsError();
        }

        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) {
          await recordLoginAttempt(ip, email, false);
          throw new InvalidCredentialsError();
        }

        if (!user.isActive || user.deletedAt) {
          await recordLoginAttempt(ip, email, false);
          throw new AccountDisabledError();
        }

        await recordLoginAttempt(ip, email, true);
        await prisma.$transaction([
          prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
          prisma.auditLog.create({
            data: {
              actorId: user.id,
              action: 'auth.login',
              entityType: 'User',
              entityId: user.id,
              ip,
            },
          }),
        ]);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          theme: user.theme,
          timezone: user.timezone,
          extension: user.extension,
          soundNotifications: user.soundNotifications,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, user, trigger }) {
      const claims = asAppToken(token);

      if (user) {
        claims.sub = user.id ?? claims.sub;
        claims.role = user.role;
        claims.name = user.name ?? '';
        claims.email = user.email ?? '';
        claims.mustChangePassword = user.mustChangePassword;
        claims.theme = user.theme;
        claims.timezone = user.timezone;
        claims.extension = user.extension;
        claims.soundNotifications = user.soundNotifications;
        claims.refreshedAt = Date.now();
        return claims;
      }

      const stale = Date.now() - (claims.refreshedAt ?? 0) > TOKEN_REFRESH_MS;
      if (!stale && trigger !== 'update') return claims;

      if (!claims.sub) return claims;

      const fresh = await prisma.user.findUnique({
        where: { id: claims.sub },
        select: {
          name: true,
          email: true,
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

      // Пользователь удалён или деактивирован — сессия должна умереть
      if (!fresh || !fresh.isActive || fresh.deletedAt) {
        return null;
      }

      claims.name = fresh.name;
      claims.email = fresh.email;
      claims.role = fresh.role;
      claims.mustChangePassword = fresh.mustChangePassword;
      claims.theme = fresh.theme;
      claims.timezone = fresh.timezone;
      claims.extension = fresh.extension;
      claims.soundNotifications = fresh.soundNotifications;
      claims.refreshedAt = Date.now();
      return claims;
    },
  },
});
