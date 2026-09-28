'use client';

import type { Role } from '@prisma/client';
import { Bell, ClipboardCheck, Monitor, Moon, Search, Sun } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { useCallResults } from '@/components/calls/call-result-dialog';
import { RealtimeIndicator } from '@/components/layout/realtime-indicator';
import { UserMenu } from '@/components/layout/user-menu';
import { useRealtime } from '@/components/providers/realtime-provider';
import { useTheme } from '@/components/theme/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/misc';
import { ru } from '@/lib/i18n/ru';
import { pageTitle } from '@/lib/nav';
import { formatRelative } from '@/lib/time';
import { cn } from '@/lib/utils';

type Notification = { id: string; title: string; description: string; at: string };

export function Header({ user }: { user: { name: string; email: string; role: Role } }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, resolved, setMode } = useTheme();
  const { lastEvent } = useRealtime();
  const { pendingCount, openPending } = useCallResults();

  const [search, setSearch] = React.useState('');
  const [notifications, setNotifications] = React.useState<Notification[]>([]);

  // Колокольчик собирает входящие звонки, пришедшие по realtime
  React.useEffect(() => {
    if (!lastEvent || lastEvent.event !== 'call.created') return;
    if (lastEvent.direction !== 'INBOUND') return;
    setNotifications((prev) =>
      [
        {
          id: lastEvent.id,
          title: ru.calls.incomingCall,
          description: ru.callStatus[lastEvent.status as keyof typeof ru.callStatus] ?? '',
          at: lastEvent.at,
        },
        ...prev.filter((n) => n.id !== lastEvent.id),
      ].slice(0, 12),
    );
  }, [lastEvent]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    router.push(query ? `/calls?search=${encodeURIComponent(query)}` : '/calls');
  };

  const cycleTheme = () => {
    setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light');
  };

  const ThemeIcon = mode === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--glass)] px-4 backdrop-blur-xl md:h-20 lg:px-7">
      <h1 className="display-heading min-w-0 truncate text-base text-[var(--foreground)] md:text-xl">
        {pageTitle(pathname)}
      </h1>

      <form
        onSubmit={submitSearch}
        className="ml-auto hidden max-w-xs flex-1 sm:block"
        role="search"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={ru.calls.searchPlaceholder}
            aria-label={ru.common.search}
            className="h-9 border-transparent bg-[var(--surface)] pl-8 max-md:h-10"
            inputMode="search"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1 sm:ml-0">
        <RealtimeIndicator />

        {pendingCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={openPending}
            className="gap-1.5 text-[var(--price-margin-badge-text)] dark:text-[var(--price-margin-badge-text)]"
            title={ru.callResult.pendingHint}
          >
            <ClipboardCheck aria-hidden />
            <span className="hidden lg:inline">{ru.callResult.pendingBadge}</span>
            <span className="numeric text-2xs flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--price-margin-badge-bg)] px-1.5 font-semibold">
              {pendingCount}
            </span>
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={ru.notifications.title}
              className="relative"
            >
              <Bell aria-hidden />
              {notifications.length > 0 ? (
                <span
                  className="absolute top-2 right-2 size-2 rounded-full bg-[var(--price-margin-badge-bg)]"
                  aria-hidden
                />
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{ru.notifications.title}</span>
              {notifications.length > 0 ? (
                <button
                  type="button"
                  className="text-2xs text-[var(--brand)] hover:underline dark:text-[var(--brand-text)]"
                  onClick={() => setNotifications([])}
                >
                  {ru.notifications.clear}
                </button>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <EmptyState
                title={ru.notifications.empty}
                hint={ru.notifications.emptyHint}
                className="py-8"
              />
            ) : (
              notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  onSelect={() => router.push(`/calls/${notification.id}`)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="font-medium text-[var(--foreground)]">{notification.title}</span>
                  <span className="text-2xs text-[var(--text-muted)]">
                    {notification.description} · {formatRelative(notification.at)}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          aria-label={ru.theme.toggle}
          title={`${ru.theme.label}: ${mode === 'system' ? ru.theme.system : mode === 'dark' ? ru.theme.dark : ru.theme.light}`}
        >
          <ThemeIcon aria-hidden />
        </Button>

        {/* На телефоне сайдбара нет — без этого меню некуда нажать «Выйти» */}
        <div className="md:hidden">
          <UserMenu user={user} collapsed />
        </div>
      </div>
    </header>
  );
}

/** Экраны с собственным поиском — глобальную строку на них не дублируем. */
const SCREENS_WITH_OWN_SEARCH = ['/calls', '/contacts'];

/**
 * Мобильный поиск отдельной строкой под шапкой: на телефоне в шапку
 * полноразмерное поле не помещается.
 */
export function MobileSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = React.useState('');

  const hasOwnSearch = SCREENS_WITH_OWN_SEARCH.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (hasOwnSearch) return null;

  return (
    <form
      className="border-b border-[var(--border)] px-3 py-2 sm:hidden"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        router.push(query ? `/calls?search=${encodeURIComponent(query)}` : '/calls');
      }}
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={ru.calls.searchPlaceholder}
          aria-label={ru.common.search}
          className={cn('pl-8')}
          inputMode="search"
        />
      </div>
    </form>
  );
}
