import * as React from 'react';

import { cn } from '@/lib/utils';

export type ProgressTone = 'brand' | 'success' | 'danger' | 'muted';

const TONE_FILL: Record<ProgressTone, string> = {
  brand: 'var(--brand)',
  success: 'var(--success)',
  danger: 'var(--destructive)',
  muted: 'var(--text-muted)',
};

/**
 * Полоса прогресса задачи. Ширина анимируется transform-ом, а не width:
 * при каждом realtime-обновлении не пересчитывается раскладка.
 */
export function ProgressBar({
  value,
  tone = 'brand',
  size = 'md',
  label,
  className,
}: {
  /** 0–100 */
  value: number;
  tone?: ProgressTone;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-[var(--surface)]',
        size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2',
        className,
      )}
    >
      <div
        className="absolute inset-y-0 left-0 w-full origin-left rounded-full transition-transform duration-700 ease-out"
        style={{ transform: `scaleX(${clamped / 100})`, backgroundColor: TONE_FILL[tone] }}
      />
    </div>
  );
}

/** Кольцевой прогресс для сводки: крупная цифра процента в центре. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  tone = 'brand',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: ProgressTone;
  children?: React.ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: 'var(--surface)' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
          style={{ stroke: TONE_FILL[tone] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
