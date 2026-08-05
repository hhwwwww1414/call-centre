'use client';

import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

import { ru } from '@/lib/i18n/ru';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export type CallEvent = {
  event: 'call.created' | 'call.updated';
  id: string;
  userId: string | null;
  status: string;
  direction: string;
  outcome: string;
  at: string;
};

type RealtimeContextValue = {
  state: ConnectionState;
  /** id звонков, которые надо подсветить в журнале. */
  highlighted: Set<string>;
  lastEvent: CallEvent | null;
};

const RealtimeContext = React.createContext<RealtimeContextValue>({
  state: 'connecting',
  highlighted: new Set(),
  lastEvent: null,
});

const HIGHLIGHT_MS = 2200;

export function RealtimeProvider({
  children,
  soundEnabled = false,
}: {
  children: React.ReactNode;
  soundEnabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<ConnectionState>('connecting');
  const [highlighted, setHighlighted] = React.useState<Set<string>>(() => new Set());
  const [lastEvent, setLastEvent] = React.useState<CallEvent | null>(null);

  const wasConnected = React.useRef(false);
  const soundRef = React.useRef<HTMLAudioElement | null>(null);
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const invalidate = React.useCallback(() => {
    // Точечная инвалидация: перерисовываются журнал и KPI, а не всё подряд
    void queryClient.invalidateQueries({ queryKey: ['calls'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    void queryClient.invalidateQueries({ queryKey: ['contacts'] });
  }, [queryClient]);

  React.useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    let disposed = false;
    // Копия ссылки для cleanup: к моменту размонтирования timersRef.current
    // может указывать уже на другой объект
    const timers = timersRef.current;

    const connect = () => {
      if (disposed) return;
      setState((prev) => (prev === 'connected' ? prev : 'connecting'));

      source = new EventSource('/api/events/stream');

      source.addEventListener('ready', () => {
        retryDelay = 1000;
        setState('connected');
        // После обрыва могли пройти события — забираем экран целиком (ТЗ 6)
        if (wasConnected.current) {
          invalidate();
          toast.success(ru.realtime.reconnected);
        }
        wasConnected.current = true;
      });

      source.addEventListener('call', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent<string>).data) as CallEvent;
          setLastEvent(payload);
          invalidate();

          if (payload.event === 'call.created') {
            markHighlighted(payload.id);
            if (payload.direction === 'INBOUND' && payload.status === 'RINGING') {
              toast(ru.calls.incomingCall, { description: ru.calls.newCall });
              if (soundEnabled) playSound();
            }
          }
        } catch {
          // Битое событие не должно ронять подписку — просто пропускаем
        }
      });

      source.onerror = () => {
        source?.close();
        source = null;
        setState('disconnected');
        if (disposed) return;
        // Экспоненциальная задержка переподключения, потолок — 30 секунд
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      };
    };

    const markHighlighted = (id: string) => {
      setHighlighted((prev) => new Set(prev).add(id));
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setHighlighted((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        timers.delete(id);
      }, HIGHLIGHT_MS);
      timers.set(id, timer);
    };

    const playSound = () => {
      try {
        soundRef.current ??= new Audio('/audio/incoming.wav');
        soundRef.current.currentTime = 0;
        void soundRef.current.play().catch(() => undefined);
      } catch {
        // Браузер может запретить автовоспроизведение — это не ошибка
      }
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [invalidate, soundEnabled]);

  const value = React.useMemo<RealtimeContextValue>(
    () => ({ state, highlighted, lastEvent }),
    [state, highlighted, lastEvent],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  return React.useContext(RealtimeContext);
}
