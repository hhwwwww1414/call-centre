import { CallStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

import { safeCompare } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { digitsOnly, toE164 } from '@/lib/phone';
import type { NormalizedCallEvent, TelephonyProvider } from '@/lib/telephony/types';

/**
 * Интеграция с АТС Sipuni.
 *
 * Документация: https://doc.sipuni.com/articles/636--api/
 *   - события звонков: «Отправка событий HTTP» (636-640);
 *   - заказ звонка: help.sipuni.com/articles/134-182-113 (callback/call_number);
 *   - статистика и записи: «Получение статистики» (636-642).
 *
 * Подпись исходящих запросов — md5 от значений параметров через «+» в порядке
 * из документации, в конце номер кабинета и секретный ключ интеграции.
 *
 * Входящие события Sipuni не подписывает. Защищаемся секретным токеном в URL
 * вебхука (?token=…): адрес с токеном знают только наш сервер и кабинет АТС.
 */
export class SipuniTelephonyProvider implements TelephonyProvider {
  readonly name = 'sipuni';

  private readonly apiUrl = (process.env.SIPUNI_API_URL || 'https://sipuni.com/api').replace(
    /\/+$/,
    '',
  );
  private readonly user = process.env.SIPUNI_USER?.trim() ?? '';
  private readonly secret = process.env.SIPUNI_SECRET?.trim() ?? '';
  private readonly webhookToken = process.env.SIPUNI_WEBHOOK_TOKEN?.trim() ?? '';

  isConfigured(): boolean {
    return Boolean(this.user && this.secret && this.webhookToken);
  }

  /** Какие переменные окружения заданы — для экрана /admin/telephony. */
  configState(): Record<string, boolean> {
    return {
      SIPUNI_USER: Boolean(this.user),
      SIPUNI_SECRET: Boolean(this.secret),
      SIPUNI_WEBHOOK_TOKEN: Boolean(this.webhookToken),
    };
  }

  /** Токен, который надо дописать к URL вебхука в кабинете Sipuni. */
  get webhookQuery(): string {
    return this.webhookToken ? `?token=${encodeURIComponent(this.webhookToken)}` : '';
  }

  /**
   * Звонок в один клик (callback/call_number): АТС звонит на внутренний
   * номер менеджера, после ответа — клиенту. reverse=0 — сначала менеджеру,
   * antiaon=0 — клиент видит номер компании.
   */
  async originate(params: {
    fromExtension: string;
    toNumber: string;
    userId: string;
  }): Promise<{ externalId: string }> {
    this.assertConfigured();

    const phone = digitsOnly(toE164(params.toNumber) || params.toNumber);
    const response = await this.request<Record<string, unknown>>('callback/call_number', [
      ['antiaon', '0'],
      ['phone', phone],
      ['reverse', '0'],
      ['sipnumber', params.fromExtension],
    ]);

    if (response.success === false) {
      throw new Error(`Sipuni отклонил вызов: ${str(response.message) ?? 'без пояснения'}`);
    }

    // id заказа звонка — только для аудита. Сам звонок придёт вебхуком
    // со своим call_id, по нему он и попадёт в журнал
    const externalId =
      str(response.callId ?? response.call_id ?? response.id) ?? `sipuni-order-${randomUUID()}`;
    return { externalId };
  }

  verifyWebhook(req: { rawBody: string; headers: Record<string, string>; url?: string }): boolean {
    if (!this.webhookToken) {
      logger.warn('SIPUNI_WEBHOOK_TOKEN не задан — вебхук Sipuni закрыт');
      return false;
    }
    const provided =
      (req.url ? new URL(req.url).searchParams.get('token') : null) ??
      req.headers['x-webhook-token'] ??
      '';
    return provided ? safeCompare(provided, this.webhookToken) : false;
  }

  parseEvent(rawBody: unknown): NormalizedCallEvent | null {
    if (!rawBody || typeof rawBody !== 'object') return null;
    const body = rawBody as Record<string, unknown>;

    const externalId = str(body.call_id);
    const eventCode = str(body.event);
    if (!externalId || !eventCode) {
      logger.warn({ keys: Object.keys(body) }, 'sipuni webhook: нет call_id или event');
      return null;
    }

    // 4 — промежуточное завершение при переводе с подсказкой: разговор
    // с клиентом продолжается, финал придёт отдельным event=2
    if (eventCode === '4') return null;
    if (!['1', '2', '3'].includes(eventCode)) {
      logger.warn({ eventCode }, 'sipuni webhook: неизвестный тип события');
      return null;
    }

    const srcExternal = str(body.src_type) === '1';
    const dstExternal = str(body.dst_type) === '1';

    // Звонок между сотрудниками по коротким номерам — не клиентский, в CRM не пишем
    if (!srcExternal && !dstExternal && str(body.src_type) && str(body.dst_type)) return null;

    const direction: 'INBOUND' | 'OUTBOUND' = srcExternal ? 'INBOUND' : 'OUTBOUND';

    // В src_num/dst_num внутренние номера приходят логинами «кабинет+короткий»,
    // поэтому для нашей стороны берём short_* — это и есть добавочный менеджера
    const fromNumber =
      direction === 'OUTBOUND'
        ? (str(body.short_src_num) ?? str(body.src_num) ?? '')
        : (str(body.src_num) ?? '');
    const toNumber =
      direction === 'INBOUND' && !dstExternal
        ? (str(body.short_dst_num) ?? str(body.dst_num) ?? '')
        : (str(body.dst_num) ?? '');

    const at = unix(body.timestamp) ?? new Date();

    const event: NormalizedCallEvent = {
      externalId,
      type: 'ringing',
      direction,
      status: CallStatus.RINGING,
      fromNumber,
      toNumber,
      startedAt: at,
      raw: rawBody,
    };

    const extension = extractExtension(body, direction, dstExternal);
    if (extension) event.extension = extension;

    if (eventCode === '3') {
      event.type = 'answered';
      event.status = CallStatus.IN_PROGRESS;
      event.answeredAt = at;
      return event;
    }

    if (eventCode === '2') {
      const status = (str(body.status) ?? '').toUpperCase();
      const answeredAt = unix(body.call_answer_timestamp);
      event.startedAt = unix(body.call_start_timestamp) ?? at;
      event.endedAt = at;
      if (answeredAt) event.answeredAt = answeredAt;
      event.status = mapHangupStatus(status, direction, Boolean(answeredAt));
      event.type = event.status === CallStatus.COMPLETED ? 'completed' : 'failed';

      const recordingUrl = str(body.call_record_link);
      if (recordingUrl) event.recordingUrl = recordingUrl;
    }

    return event;
  }

  /** Ссылка на запись приходит в событии завершения (call_record_link). */
  async getRecordingUrl(): Promise<string | null> {
    return null;
  }

  /** Самый дешёвый подписанный запрос — список сотрудников. */
  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        message:
          'Не заданы SIPUNI_USER, SIPUNI_SECRET и SIPUNI_WEBHOOK_TOKEN в переменных окружения',
      };
    }
    try {
      await this.request('statistic/operators', [], 'text');
      return { ok: true, message: 'API Sipuni отвечает, ключ интеграции принят' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось связаться с API';
      return { ok: false, message };
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('Телефония Sipuni не настроена: проверьте переменные окружения на сервере');
    }
  }

  /** md5(значения через «+» + user + secret) — порядок полей важен. */
  signature(values: string[]): string {
    return createHash('md5')
      .update([...values, this.user, this.secret].join('+'))
      .digest('hex');
  }

  /** Ретраи 3 попытки с экспоненциальной задержкой, таймаут 10 секунд. */
  private async request<T>(
    method: string,
    params: Array<[string, string]>,
    format: 'json' | 'text' = 'json',
    attempt = 1,
  ): Promise<T> {
    const body = new URLSearchParams();
    for (const [key, value] of params) body.set(key, value);
    body.set('user', this.user);
    body.set('hash', this.signature(params.map(([, value]) => value)));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${this.apiUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
        cache: 'no-store',
      });

      const text = await response.text();
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`Sipuni ответил ${response.status}: ${text.slice(0, 200)}`);
        }
        throw new RetryableError(`Sipuni ответил ${response.status}`);
      }

      if (format === 'text') return text as T;
      try {
        return (text ? JSON.parse(text) : {}) as T;
      } catch {
        throw new Error(`Sipuni вернул не JSON: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      const retryable = err instanceof RetryableError || (err as Error)?.name === 'AbortError';
      if (retryable && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 300));
        return this.request<T>(method, params, format, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

class RetryableError extends Error {}

/**
 * Чей это звонок. Входящий — у того, на чей короткий номер он пришёл
 * (при дозвоне на группу — last_called), исходящий — у инициатора.
 */
function extractExtension(
  body: Record<string, unknown>,
  direction: 'INBOUND' | 'OUTBOUND',
  dstExternal: boolean,
): string | undefined {
  if (direction === 'OUTBOUND') return str(body.short_src_num);
  if (!dstExternal) {
    const short = str(body.short_dst_num);
    if (short) return short;
  }
  // last_called может прийти списком, если звонок шёл нескольким сразу
  const lastCalled = str(body.last_called);
  return lastCalled?.split(/[,;\s]+/).find(Boolean);
}

/**
 * Статусы event=2: ANSWER, BUSY, NOANSWER, CANCEL, CONGESTION, CHANUNAVAIL.
 * Для входящего любой неответ — «пропущен»: клиент звонил, а мы не взяли.
 */
function mapHangupStatus(
  status: string,
  direction: 'INBOUND' | 'OUTBOUND',
  answered: boolean,
): CallStatus {
  if (status === 'ANSWER' || (answered && !status)) return CallStatus.COMPLETED;
  if (direction === 'INBOUND') return CallStatus.MISSED;
  switch (status) {
    case 'BUSY':
      return CallStatus.BUSY;
    case 'NOANSWER':
      return CallStatus.NO_ANSWER;
    case 'CANCEL':
      return CallStatus.CANCELED;
    default:
      return CallStatus.FAILED;
  }
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map((v) => String(v)).join(',') || undefined;
  return undefined;
}

/** Unix timestamp в секундах (UTC). Ноль — «события не было». */
function unix(value: unknown): Date | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000);
}
