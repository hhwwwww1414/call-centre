'use client';

import type { Role } from '@prisma/client';
import { LogOut, Monitor, Moon, Sun, User as UserIcon } from 'lucide-react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import * as React from 'react';

import { useTheme, type ThemeMode } from '@/components/theme/theme-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar } from '@/components/ui/misc';
import { ru } from '@/lib/i18n/ru';
import { cn } from '@/lib/utils';

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: ru.theme.light, icon: Sun },
  { mode: 'dark', label: ru.theme.dark, icon: Moon },
  { mode: 'system', label: ru.theme.system, icon: Monitor },
];

export function UserMenu({
  user,
  collapsed = false,
}: {
  user: { name: string; email: string; role: Role };
  collapsed?: boolean;
}) {
  const { mode, setMode } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-[var(--surface)]"
        >
          <Avatar name={user.name} />
          <span className={cn('min-w-0 flex-col', collapsed ? 'hidden' : 'hidden lg:flex')}>
            <span className="truncate text-xs font-medium text-[var(--foreground)]">{user.name}</span>
            <span className="truncate text-2xs text-[var(--text-muted)]">{ru.roles[user.role]}</span>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="min-w-56">
        <DropdownMenuLabel>
          <span className="block truncate text-xs font-medium text-[var(--foreground)]">
            {user.name}
          </span>
          <span className="block truncate font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserIcon aria-hidden />
            {ru.nav.profile}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{ru.theme.label}</DropdownMenuLabel>
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.mode}
              onSelect={(event) => {
                event.preventDefault();
                setMode(option.mode);
              }}
              className={cn(mode === option.mode && 'bg-[var(--accent)]')}
            >
              <Icon aria-hidden />
              {option.label}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void signOut({ callbackUrl: '/login' })}>
          <LogOut aria-hidden />
          {ru.auth.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
