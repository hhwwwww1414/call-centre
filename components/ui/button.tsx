'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[var(--primary)] shadow-soft',
        secondary:
          'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--surface-2)] border border-[var(--border)]',
        outline:
          'border border-[var(--border-strong)] bg-transparent text-[var(--foreground)] hover:bg-[var(--surface)]',
        ghost:
          'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]',
        destructive: 'bg-[var(--destructive-soft)] text-[var(--destructive)] hover:opacity-80',
        link: 'bg-transparent text-[var(--brand)] underline-offset-4 hover:underline dark:text-[var(--brand-text)]',
      },
      size: {
        // Минимум 44px по высоте на сенсорных экранах (ТЗ 2.5)
        sm: 'h-9 px-3 text-xs [&_svg]:size-4 max-md:h-11',
        md: 'h-10 px-4 text-sm [&_svg]:size-4 max-md:h-11',
        lg: 'h-11 px-6 text-sm [&_svg]:size-5',
        icon: 'size-10 [&_svg]:size-4 max-md:size-11',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* Slot принимает ровно один дочерний элемент — спиннер добавляем только обычной кнопке */}
      {loading && !asChild ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { buttonVariants };
