import { Client } from 'pg';

import { logger } from '@/lib/logger';
import { buildListenerConfig } from '@/lib/realtime/pg-config';

export const CALL_EVENTS_CHANNEL = 'call_events';

/** По каналу идут и звонки, и задачи: у задачи userId — это исполнитель. */
export type CallEvent = {
  event: 'call.created' | 'call.updated' | 'task.created' | 'task.updated' | 'task.deleted';
  id: string;
  userId: string | null;
  status: string;
  direction?: string;
  outcome?: string;
  at: string;
};

type Subscriber = (event: CallEvent) => void;

/**
 * Одно постоянное подключение к Postgres на LISTEN call_events на процесс
 * приложения (ТЗ 6). Раздаёт события всем открытым SSE-потокам.
 *
 * Живёт в globalThis, потому что в dev Next пересоздаёт модули при HMR —
 * иначе на каждой правке появлялся бы ещё один слушатель.
 */
class CallEventBus {
  private client: Client | null = null;
  private subscribers = new Set<Subscriber>();
  private connecting: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayMs = 1000;
  private failures = 0;
  private closed = false;

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  get isConnected(): boolean {
    return this.client !== null;
  }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    void this.ensureConnected();
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.client || this.closed) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      logger.error('DATABASE_URL не задан — realtime отключён');
      return;
    }

    // keepAlive обязателен: слушатель держит соединение часами, а без него
    // NAT или файрвол молча рвут сокет — события просто перестают приходить
    const client = new Client(buildListenerConfig(connectionString));

    client.on('notification', (msg) => {
      if (msg.channel !== CALL_EVENTS_CHANNEL || !msg.payload) return;
      try {
        const event = JSON.parse(msg.payload) as CallEvent;
        for (const subscriber of this.subscribers) {
          try {
            subscriber(event);
          } catch (err) {
            logger.warn({ err }, 'realtime subscriber failed');
          }
        }
      } catch (err) {
        logger.warn({ err, payload: msg.payload }, 'realtime: не разобрал payload');
      }
    });

    client.on('error', (err) => {
      logger.warn({ err }, 'realtime listener error, переподключаемся');
      this.handleDisconnect();
    });

    client.on('end', () => {
      if (!this.closed) this.handleDisconnect();
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${CALL_EVENTS_CHANNEL}`);
      this.client = client;
      this.retryDelayMs = 1000;
      this.failures = 0;
      logger.info('realtime listener подключён к Postgres');
    } catch (err) {
      this.failures += 1;
      // Первый сбой — ошибка, дальше понижаем уровень: при затяжном обрыве
      // лог не должен превращаться в стену одинаковых стектрейсов
      if (this.failures === 1) logger.error({ err }, 'realtime listener не подключился');
      else logger.warn({ attempt: this.failures }, 'realtime listener всё ещё не подключился');
      await client.end().catch(() => undefined);
      this.scheduleReconnect();
    }
  }

  private handleDisconnect(): void {
    const previous = this.client;
    this.client = null;
    if (previous) void previous.end().catch(() => undefined);
    this.scheduleReconnect();
  }

  /** Экспоненциальная задержка до 30 секунд, ровно один таймер в полёте. */
  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    const delay = this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, 30_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected();
    }, delay);
    if (typeof this.reconnectTimer.unref === 'function') this.reconnectTimer.unref();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.subscribers.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const client = this.client;
    this.client = null;
    if (client) await client.end().catch(() => undefined);
  }
}

const globalForBus = globalThis as unknown as { callEventBus?: CallEventBus };

export const callEventBus: CallEventBus = globalForBus.callEventBus ?? new CallEventBus();

if (process.env.NODE_ENV !== 'production') {
  globalForBus.callEventBus = callEventBus;
}
