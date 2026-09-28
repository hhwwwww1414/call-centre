'use client';

import type { LucideIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

/** Compact KPI with neutral values and semantic indicators. */
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
    <div className="surface-card flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <div className="flex min-h-10 items-start justify-between gap-2">
        <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
        {Icon ? <Icon className="size-4 shrink-0" style={{ color: accent }} aria-hidden /> : null}
      </div>

      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <p
          className={cn('display-heading numeric text-xl leading-none sm:text-2xl')}
          style={{ color: 'var(--foreground)' }}
        >
          {value}
        </p>
      )}

      {hint ? <p className="text-2xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}
