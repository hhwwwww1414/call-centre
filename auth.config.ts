import type { NextAuthConfig } from 'next-auth';

import { asAppToken } from '@/lib/auth/token';

/**
 * Edge-безопасная часть конфига: без Prisma, без argon2, без node:crypto.
 * Её использует middleware. Всё, что ходит в БД, живёт в auth.ts.
 */
/**
 * Признак Secure-кук берём из схемы публичного адреса, а не из NODE_ENV.
 * Браузер отвергает куку с префиксом `__Secure-`, если она пришла не по HTTPS,
 * поэтому продакшен-сборка, поднятая по http (локальная проверка, отладка
 * за прокси), просто не смогла бы залогинить пользователя.
 */
const publicUrl =
  process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? '';
const useSecureCookies = publicUrl.startsWith('https://');

export const authConfig = {
  trustHost: true,
  useSecureCookies,
  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60, // 12 часов (ТЗ 3.4)
    updateAge: 30 * 60, // скользящее продление раз в полчаса
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  cookies: {
    sessionToken: {
      name: useSecureCookies ? '__Secure-vin2win.session' : 'vin2win.session',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    /**
     * Раскладывает поля токена в session.user. Чистая функция — работает
     * и в middleware (edge), и в Node.
     */
    session({ session, token }) {
      const claims = asAppToken(token);
      if (session.user) {
        session.user.id = claims.sub ?? '';
        session.user.role = claims.role ?? 'MANAGER';
        session.user.name = claims.name ?? '';
        session.user.email = claims.email ?? '';
        session.user.mustChangePassword = claims.mustChangePassword ?? false;
        session.user.theme = claims.theme ?? 'system';
        session.user.timezone = claims.timezone ?? 'Europe/Moscow';
        session.user.extension = claims.extension ?? null;
        session.user.soundNotifications = claims.soundNotifications ?? false;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
