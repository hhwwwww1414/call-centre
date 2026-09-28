import type { CallStatus } from '@prisma/client';

/**
 * Контракт телефонии. Ни один компонент UI и ни один сервис не знает,
 * что под ним — mock или Exolve (ТЗ 7.1).
 */
export interface TelephonyProvider {
  readonly name: string;

  /** Настроен ли провайдер настолько, чтобы с ним можно было работать. */
  isConfigured(): boolean;

  /** Инициировать исходящий звонок (click-to-call). */
  originate(params: {
    fromExtension: string;
    toNumber: string;
    userId: string;
  }): Promise<{ externalId: string }>;

  /** Проверить подпись входящего вебхука. url — для провайдеров с токеном в адресе. */
  verifyWebhook(req: { rawBody: string; headers: Record<string, string>; url?: string }): boolean;

  /** Привести сырой payload провайдера к нашей модели события. */
  parseEvent(rawBody: unknown): NormalizedCallEvent | null;

  /** Получить ссылку на запись разговора. */
  getRecordingUrl(externalId: string): Promise<string | null>;

  /** Проверка доступности API. */
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}

export type NormalizedCallEvent = {
  externalId: string;
  type: 'ringing' | 'answered' | 'completed' | 'failed';
  direction: 'INBOUND' | 'OUTBOUND';
  status: CallStatus;
  fromNumber: string;
  toNumber: string;
  extension?: string;
  startedAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  waitSeconds?: number;
  recordingUrl?: string;
  /** Прямое указание менеджера — mock знает его сразу, АТС выведет по extension. */
  userId?: string;
  raw: unknown;
};

export type TelephonyStatus = {
  provider: string;
  configured: boolean;
  ok: boolean;
  message?: string;
};

/** Задел под транскрибацию (ТЗ 7.4) — интерфейс объявлен, реализация позже. */
export interface TranscriptionProvider {
  readonly name: string;
  transcribe(recordingUrl: string): Promise<TranscriptResult>;
}

export type TranscriptResult = {
  status: 'READY' | 'FAILED';
  language: string;
  fullText?: string;
  segments?: Array<{ speaker: string; startMs: number; endMs: number; text: string }>;
  summary?: string;
};
