'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isActivePath, MOBILE_NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Нижняя навигация телефона: 4 пункта, цели минимум 44×44 (ТЗ 2.5). */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--glass)] backdrop-blur-xl md:hidden"
      aria-label="Основная навигация"
    >
      <ul className="grid grid-cols-4">
        {MOBILE_NAV.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-2xs flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 font-medium transition-colors',
                  active
                    ? 'text-[var(--brand)] dark:text-[var(--brand-text)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
