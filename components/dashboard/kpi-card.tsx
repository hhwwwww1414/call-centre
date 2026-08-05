'use client';

import type { LucideIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

/** KPI-карточка. Цифра — крупная, шрифтом Unbounded (ТЗ 2.3). */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'success' | 'danger' | 'attention';
  loading?: boolean;
}) {
  const accent =
    tone === 'success'
      ? 'var(--success)'
      : tone === 'danger'
        ? 'var(--destructive)'
        : tone === 'attention'
          ? 'var(--price-margin-badge-bg)'
          : 'var(--text-muted)';

  return (
    <div className="surface-card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </p>
        {Icon ? <Icon className="size-4 shrink-0" style={{ color: accent }} aria-hidden /> : null}
      </div>

      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <p
          className={cn('display-heading numeric text-xl leading-none sm:text-2xl')}
          style={{ color: tone === 'neutral' ? 'var(--foreground)' : accent }}
        >
          {value}
        </p>
      )}

      {hint ? <p className="text-2xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}
