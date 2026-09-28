'use client';

import type { Role } from '@prisma/client';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { Logo } from '@/components/brand/logo';
import { UserMenu } from '@/components/layout/user-menu';
import { Button } from '@/components/ui/button';
import { ru } from '@/lib/i18n/ru';
import { isActivePath, visibleNav, type NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';

const COLLAPSE_KEY = 'vin2win.sidebar.collapsed';

export function Sidebar({
  user,
}: {
  user: { id: string; name: string; email: string; role: Role };
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const { work, admin } = visibleNav(user.role);

  React.useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <aside
      className={cn(
        // На планшете сайдбар всегда в иконках, на десктопе — по выбору (ТЗ 2.5)
        'hidden shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-16 lg:w-56',
      )}
      data-collapsed={collapsed}
    >
      <div className={cn('flex h-20 items-center gap-2 px-3 lg:px-4')}>
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5"
          aria-label={`${ru.app.name} — ${ru.app.subtitle}`}
        >
          {/* В свёрнутом сайдбаре знак ужимается по ширине колонки,
              в развёрнутом — идёт в полный размер с подписью раздела */}
          <Logo
            width={collapsed ? 40 : 40}
            className={cn('shrink-0', collapsed ? '' : 'lg:hidden')}
          />
          <span className={cn('min-w-0 flex-col gap-0.5', collapsed ? 'hidden' : 'hidden lg:flex')}>
            <Logo width={92} />
            <span className="text-2xs truncate text-[var(--text-muted)]">{ru.app.subtitle}</span>
          </span>
        </Link>
      </div>

      <nav
        aria-label="Разделы CRM"
        className="flex-1 scrollbar-none overflow-y-auto px-2 py-3 lg:px-3"
      >
        <NavGroup
          title={ru.nav.sectionWork}
          items={work}
          pathname={pathname}
          collapsed={collapsed}
        />
        {admin.length > 0 ? (
          <NavGroup
            title={ru.nav.sectionAdmin}
            items={admin}
            pathname={pathname}
            collapsed={collapsed}
            className="mt-7"
          />
        ) : null}
      </nav>

      <div className="border-t border-[var(--border)] p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="hidden w-full justify-start gap-2 px-2 lg:flex"
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          {!collapsed ? <span className="text-xs">Свернуть</span> : null}
        </Button>
        <UserMenu user={user} collapsed={collapsed} />
      </div>
    </aside>
  );
}

function NavGroup({
  title,
  items,
  pathname,
  collapsed,
  className,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p
        className={cn(
          'text-2xs px-2.5 pb-2.5 font-medium text-[var(--text-muted)]',
          collapsed ? 'hidden' : 'hidden lg:block',
        )}
      >
        {title}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-10 items-center gap-3 rounded-md px-2.5 text-xs font-medium transition-colors duration-200',
                  active
                    ? 'bg-[var(--brand-soft)] text-[var(--brand)] dark:text-[var(--brand-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className={cn('truncate', collapsed ? 'hidden' : 'hidden lg:inline')}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
