'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

import { ru } from '@/lib/i18n/ru';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn('overlay-enter fixed inset-0 z-50 bg-black/30 backdrop-blur-[3px]', className)}
      {...props}
    />
  );
}

/**
 * При открытии фокус встаёт на само окно, а не на первую кнопку: иначе рамка
 * фокуса на крестике выглядит как выделение. Tab дальше ведёт по окну как обычно.
 */
function focusSelf(event: Event, handler: ((event: Event) => void) | undefined) {
  handler?.(event);
  if (event.defaultPrevented) return;
  event.preventDefault();
  (event.target as HTMLElement | null)?.focus({ preventScroll: true });
}

export function DialogContent({
  className,
  children,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'overlay-enter fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
          'shadow-overlay max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--popover)] outline-none',
          // На телефоне модалка приезжает снизу — так до неё дотягивается большой палец
          'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none',
          className,
        )}
        tabIndex={-1}
        onOpenAutoFocus={(event) => focusSelf(event, onOpenAutoFocus)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-3 right-3 rounded-md p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          aria-label={ru.common.close}
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5 pb-3', className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('pr-8 text-base font-semibold text-[var(--foreground)]', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-xs text-[var(--text-muted)]', className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-[var(--border)] px-5 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

/* ─── Боковая панель (drawer) ──────────────────────────────────────────── */

export function SheetContent({
  className,
  children,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'sheet-enter shadow-overlay fixed top-0 right-0 z-50 flex h-dvh w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--card)] outline-none md:top-3 md:right-3 md:h-[calc(100dvh-1.5rem)] md:rounded-2xl md:border',
          // На телефоне панель занимает весь экран
          'max-md:max-w-none',
          className,
        )}
        tabIndex={-1}
        onOpenAutoFocus={(event) => focusSelf(event, onOpenAutoFocus)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Нижний лист — фильтры на телефоне открываются снизу (ТЗ 2.5). */
export function BottomSheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'overlay-enter pb-safe shadow-overlay fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-2xl border-t border-[var(--border)] bg-[var(--card)]',
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[var(--border-strong)]" aria-hidden />
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
