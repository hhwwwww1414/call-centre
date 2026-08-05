import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

const PUBLIC_PREFIXES = ['/login', '/invite', '/api/auth', '/api/health', '/api/webhooks'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Первый рубеж: не пускает анонимных дальше /login и уводит на смену
 * стартового пароля. Настоящая проверка прав — в requireRole() на сервере,
 * middleware её не заменяет.
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const session = req.auth;

  if (isPublic(pathname)) {
    // Уже вошедшего с /login отправляем на дашборд
    if (session?.user && pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!session?.user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Требуется вход' },
        { status: 401 },
      );
    }
    const url = new URL('/login', req.nextUrl);
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Стартовый пароль обязателен к смене (ТЗ 3.2)
  if (session.user.mustChangePassword && pathname !== '/profile/password') {
    if (pathname.startsWith('/api/')) return NextResponse.next();
    return NextResponse.redirect(new URL('/profile/password', req.nextUrl));
  }

  // API отсекаем сразу; страницы пропускаем дальше — их закрывает
  // requireRolePage(), которая через forbidden() отдаёт настоящий 403
  // с нашим экраном. Rewrite на /forbidden здесь не годится: такого
  // маршрута нет, и пользователь получил бы 404 вместо «доступ закрыт».
  if (pathname.startsWith('/api/admin') && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden', message: 'Недостаточно прав' }, { status: 403 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ico)$).*)'],
};
