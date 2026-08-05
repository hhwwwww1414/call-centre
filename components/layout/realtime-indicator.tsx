'use client';

import { useRealtime } from '@/components/providers/realtime-provider';
import { Tooltip } from '@/components/ui/misc';
import { ru } from '@/lib/i18n/ru';
import { cn } from '@/lib/utils';

/** Маленькая точка в шапке: зелёная — подключено, серая — переподключение (ТЗ 5.1). */
export function RealtimeIndicator() {
  const { state } = useRealtime();

  const label =
    state === 'connected'
      ? ru.realtime.connected
      : state === 'connecting'
        ? ru.realtime.connecting
        : ru.realtime.disconnected;

  return (
    <Tooltip content={label}>
      <span
        className="flex size-10 items-center justify-center max-md:size-11"
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <span
          className={cn(
            'size-2.5 rounded-full transition-colors',
            state === 'connected' && 'bg-[var(--success)]',
            state === 'connecting' && 'animate-pulse-dot bg-[var(--text-muted)]',
            state === 'disconnected' && 'bg-[var(--destructive)]',
          )}
          aria-hidden
        />
      </span>
    </Tooltip>
  );
}
