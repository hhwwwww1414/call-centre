'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '@/lib/utils';

/* ─── Скелетон ─────────────────────────────────────────────────────────── */

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-[var(--surface-2)]', className)}
      aria-hidden
      {...props}
    />
  );
}

/** Скелетон таблицы — вместо спиннера на весь экран (ТЗ 2.6). */
export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-px" aria-hidden>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton
              key={colIndex}
              className="h-4"
              style={{ width: `${[14, 22, 12, 16, 10, 18][colIndex % 6]}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Пустое состояние ─────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]">
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
        {hint ? <p className="max-w-sm text-xs text-[var(--text-muted)]">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ─── Аватар ───────────────────────────────────────────────────────────── */

export function Avatar({
  name,
  className,
  size = 'md',
}: {
  name: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <AvatarPrimitive.Root
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--brand-soft)] font-semibold text-[var(--brand)] dark:text-[var(--brand-text)]',
        size === 'sm' ? 'size-7 text-2xs' : 'size-9 text-xs',
        className,
      )}
    >
      <AvatarPrimitive.Fallback>{letters || '?'}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/* ─── Разделитель ──────────────────────────────────────────────────────── */

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      className={cn(
        'shrink-0 bg-[var(--border)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

/* ─── Переключатель ────────────────────────────────────────────────────── */

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
        'bg-[var(--border-strong)] data-[state=checked]:bg-[var(--brand)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-white shadow-soft transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

/* ─── Вкладки ──────────────────────────────────────────────────────────── */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors',
        'hover:text-[var(--foreground)]',
        'data-[state=active]:bg-[var(--card)] data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-soft',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;

/* ─── Подсказка ────────────────────────────────────────────────────────── */

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 max-w-64 rounded-md border border-[var(--border)] bg-[var(--popover)] px-2.5 py-1.5 text-2xs text-[var(--popover-foreground)] shadow-overlay"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
