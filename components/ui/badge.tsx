import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]',
        success: 'bg-[var(--success-soft)] text-[var(--success)]',
        danger: 'bg-[var(--destructive-soft)] text-[var(--destructive)]',
        // Жёлтый — редкий, только «требует внимания» (ТЗ 2.2)
        attention: 'bg-[var(--price-margin-badge-bg)] text-[var(--price-margin-badge-text)]',
        brand: 'bg-[var(--brand-soft)] text-[var(--brand)] dark:text-[var(--brand-text)]',
        outline: 'border border-[var(--border-strong)] text-[var(--text-secondary)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
