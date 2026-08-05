import { CallStatus } from '@prisma/client';

import { safeCompare } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { toE164 } from '@/lib/phone';
import type { NormalizedCallEvent, TelephonyProvider } from '@/lib/telephony/types';

/**
 * Каркас интеграции с МТС Exolve (ТЗ 7.3).
 *
 * Всё, что зависит от документации провайдера, помечено TODO(exolve) и
 * собрано чек-листом в docs/EXOLVE_INTEGRATION.md. Заполняется, когда
 * у заказчика появится личный кабинет и ключи. Структура и обработка
 * ошибок уже боевые — меняются только имена полей и путь эндпоинта.
 */
export class ExolveTelephonyProvider implements TelephonyProvider {
  readonly name = 'exolve';

  private readonly apiUrl = process.env.EXOLVE_API_URL || 'https://api.exolve.ru';
  private readonly apiKey = process.env.EXOLVE_API_KEY ?? '';
  private readonly webhookSecret = process.env.EXOLVE_WEBHOOK_SECRET ?? '';
  private readonly ourNumber = process.env.EXOLVE_NUMBER ?? '';

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.ourNumber);
  }

  /** Какие переменные окружения заданы — для экрана /admin/telephony. */
  configState(): Record<string, boolean> {
    return {
      EXOLVE_API_URL: Boolean(this.apiUrl),
      EXOLVE_API_KEY: Boolean(this.apiKey),
      EXOLVE_NUMBER: Boolean(this.ourNumber),
      EXOLVE_WEBHOOK_SECRET: Boolean(this.webhookSecret),
    };
  }

  async originate(params: {
    fromExtension: string;
    toNumber: string;
    userId: string;
  }): Promise<{ externalId: string }> {
    this.assertConfigured();

    // TODO(exolve): уточнить путь и тело запроса click-to-call в документации.
    // Ожидается что-то вида POST /v1/Call/Originate с number/extension.
    const response = await this.request<{ call_id?: string; id?: string }>('/v1/Call/Originate', {
      method: 'POST',
      body: {
        number: this.ourNumber,
        extension: params.fromExtension,
        destination: toE164(params.toNumber),
      },
    });

    const externalId = response.call_id ?? response.id;
    if (!externalId) {
      throw new Error('Exolve не вернул идентификатор звонка');
    }
    return { externalId };
  }

  /**
   * Проверка подписи вебхука.
   *
   * TODO(exolve): заменить на реальный алгоритм из документации — скорее
   * всего HMAC-SHA256 от raw body с секретом и заголовком вида X-Signature.
   * Сейчас реализовано сравнение общего секрета в постоянное время: это
   * рабочая защита от посторонних запросов, но не от повтора.
   */
  verifyWebhook(req: { rawBody: string; headers: Record<string, string> }): boolean {
    if (!this.webhookSecret) {
      logger.warn('EXOLVE_WEBHOOK_SECRET не задан — вебхук не проверяется');
      return false;
    }

    const provided =
      req.headers['x-exolve-signature'] ??
      req.headers['x-signature'] ??
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ??
      '';

    if (!provided) return false;
    return safeCompare(provided, this.webhookSecret);
  }

  /**
   * Нормализация события.
   *
   * TODO(exolve): свериться с реальными именами полей payload. Сейчас
   * поддержаны наиболее вероятные варианты написания (snake_case и camelCase),
   * чтобы после получения доков правка была точечной.
   */
  parseEvent(rawBody: unknown): NormalizedCallEvent | null {
    if (!rawBody || typeof rawBody !== 'object') return null;
    const body = rawBody as Record<string, unknown>;

    const externalId = str(body.call_id ?? body.callId ?? body.id ?? body.session_id);
    if (!externalId) {
      logger.warn({ keys: Object.keys(body) }, 'exolve webhook: не найден идентификатор звонка');
      return null;
    }

    const rawEvent = (str(body.event ?? body.event_type ?? body.status) ?? '').toLowerCase();
    const type = mapEventType(rawEvent);
    if (!type) {
      logger.warn({ rawEvent }, 'exolve webhook: неизвестный тип события');
      return null;
    }

    const fromNumber = str(body.from ?? body.from_number ?? body.caller) ?? '';
    const toNumber = str(body.to ?? body.to_number ?? body.called) ?? '';
    const direction: 'INBOUND' | 'OUTBOUND' =
      (str(body.direction) ?? '').toLowerCase() === 'outbound' ||
      (this.ourNumber && toE164(fromNumber) === toE164(this.ourNumber))
        ? 'OUTBOUND'
        : 'INBOUND';

    const startedAt = date(body.started_at ?? body.startedAt ?? body.start_time) ?? new Date();
    const answeredAt = date(body.answered_at ?? body.answeredAt ?? body.answer_time);
    const endedAt = date(body.ended_at ?? body.endedAt ?? body.end_time);
    const durationSeconds = num(body.duration ?? body.duration_seconds ?? body.talk_time);

    const event: NormalizedCallEvent = {
      externalId,
      type,
      direction,
      status: mapStatus(type, rawEvent, direction),
      fromNumber,
      toNumber,
      startedAt,
      raw: rawBody,
    };

    const extension = str(body.extension ?? body.ext ?? body.operator_id);
    if (extension) event.extension = extension;
    if (answeredAt) event.answeredAt = answeredAt;
    if (endedAt) event.endedAt = endedAt;
    if (durationSeconds != null) event.durationSeconds = durationSeconds;

    const recordingUrl = str(body.record_url ?? body.recording_url ?? body.recordUrl);
    if (recordingUrl) event.recordingUrl = recordingUrl;

    return event;
  }

  async getRecordingUrl(externalId: string): Promise<string | null> {
    this.assertConfigured();
    try {
      // TODO(exolve): уточнить эндпоинт получения записи разговора.
      const response = await this.request<{ url?: string; record_url?: string }>(
        `/v1/Call/Record?call_id=${encodeURIComponent(externalId)}`,
        { method: 'GET' },
      );
      return response.url ?? response.record_url ?? null;
    } catch (err) {
      logger.warn({ err, externalId }, 'exolve: не удалось получить запись разговора');
      return null;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        message: 'Не заданы EXOLVE_API_KEY и EXOLVE_NUMBER в переменных окружения',
      };
    }
    try {
      // TODO(exolve): заменить на реальный «дешёвый» эндпоинт (баланс, список номеров).
      await this.request('/v1/Account/Balance', { method: 'GET' });
      return { ok: true, message: 'API отвечает' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось связаться с API';
      return { ok: false, message };
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('Телефония Exolve не настроена: проверьте переменные окружения на сервере');
    }
  }

  /** Ретраи 3 попытки с экспоненциальной задержкой, таймаут 10 секунд (ТЗ 7.3). */
  private async request<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
    attempt = 1,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${this.apiUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        // 4xx повторять бессмысленно — это наша ошибка, а не сбой сети
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`Exolve ответил ${response.status}: ${text.slice(0, 200)}`);
        }
        throw new RetryableError(`Exolve ответил ${response.status}`);
      }

      const text = await response.text();
      return (text ? JSON.parse(text) : {}) as T;
    } catch (err) {
      const retryable = err instanceof RetryableError || (err as Error)?.name === 'AbortError';
      if (retryable && attempt < 3) {
        await sleep(2 ** attempt * 300);
        return this.request<T>(path, init, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

class RetryableError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function date(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (typeof value === 'number') {
    // Секунды или миллисекунды — определяем по порядку величины
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/**
 * Порядок проверок важен и держится на подстроках:
 * «noanswer» содержит «answer», а «disconnect» — «connect». Если сначала
 * искать признаки ответа, неотвеченный звонок попадёт в «разговор».
 * Поэтому сперва отсеиваем неуспех, затем завершение, и только потом ответ.
 */
function mapEventType(rawEvent: string): NormalizedCallEvent['type'] | null {
  if (/fail|error|busy|cancel|reject|no[\s_-]?answer|noanswer|missed|unavailable/.test(rawEvent)) {
    return 'failed';
  }
  if (/complet|hangup|finish|disconnect|ended|\bend\b/.test(rawEvent)) return 'completed';
  if (/answer|bridge|talk|connect|progress/.test(rawEvent)) return 'answered';
  if (/ring|dial|new|start|initiat|created/.test(rawEvent)) return 'ringing';
  return null;
}

function mapStatus(
  type: NormalizedCallEvent['type'],
  rawEvent: string,
  direction: 'INBOUND' | 'OUTBOUND',
): CallStatus {
  switch (type) {
    case 'ringing':
      return CallStatus.RINGING;
    case 'answered':
      return CallStatus.IN_PROGRESS;
    case 'completed':
      return CallStatus.COMPLETED;
    case 'failed':
      if (/busy/.test(rawEvent)) return CallStatus.BUSY;
      if (/cancel/.test(rawEvent)) return CallStatus.CANCELED;
      if (/fail|error/.test(rawEvent)) return CallStatus.FAILED;
      return direction === 'INBOUND' ? CallStatus.MISSED : CallStatus.NO_ANSWER;
  }
}
