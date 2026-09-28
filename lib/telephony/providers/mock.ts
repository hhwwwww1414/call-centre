import { CallDirection, CallStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { logger } from '@/lib/logger';
import { toE164 } from '@/lib/phone';
import { ingestCallEvent } from '@/lib/telephony/ingest';
import { chance, MOCK_RECORDING_URL, randomInt, randomPhoneE164 } from '@/lib/telephony/mock-data';
import type { NormalizedCallEvent, TelephonyProvider } from '@/lib/telephony/types';

/**
 * Демо-провайдер. Проигрывает полный жизненный цикл звонка с реальными
 * паузами — на нём видно, как строка в журнале меняет статус вживую (ТЗ 7.2).
 */
export class MockTelephonyProvider implements TelephonyProvider {
  readonly name = 'mock';

  isConfigured(): boolean {
    return true;
  }

  async originate(params: {
    fromExtension: string;
    toNumber: string;
    userId: string;
  }): Promise<{ externalId: string }> {
    const externalId = `mock-${randomUUID()}`;
    void this.playScenario({
      externalId,
      direction: CallDirection.OUTBOUND,
      externalNumber: toE164(params.toNumber) || params.toNumber,
      extension: params.fromExtension,
      userId: params.userId,
    });
    return { externalId };
  }

  verifyWebhook(): boolean {
    // Демо-режим не подписывает события: они рождаются внутри процесса
    return true;
  }

  parseEvent(rawBody: unknown): NormalizedCallEvent | null {
    if (!rawBody || typeof rawBody !== 'object') return null;
    const body = rawBody as Partial<NormalizedCallEvent>;
    if (!body.externalId || !body.direction || !body.status) return null;
    // Из JSON даты приходят строками — приводим все, а не только начало
    return {
      ...(body as NormalizedCallEvent),
      startedAt: new Date(body.startedAt ?? Date.now()),
      ...(body.answeredAt ? { answeredAt: new Date(body.answeredAt) } : {}),
      ...(body.endedAt ? { endedAt: new Date(body.endedAt) } : {}),
      raw: rawBody,
    };
  }

  async getRecordingUrl(): Promise<string | null> {
    return MOCK_RECORDING_URL;
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true, message: 'Демо-режим активен, события генерируются локально' };
  }

  /**
   * Разыгрывает звонок во времени: дозвон → разговор → завершение.
   * Каждый шаг пишется в БД, а триггер pg_notify толкает событие в SSE.
   */
  async playScenario(params: {
    externalId?: string;
    direction?: CallDirection;
    externalNumber?: string;
    extension?: string | null;
    userId?: string | null;
    ourNumber?: string;
    /** Ускорение для тестов: 1 = реальное время. */
    speed?: number;
  }): Promise<{ externalId: string; startedAt: Date }> {
    const externalId = params.externalId ?? `mock-${randomUUID()}`;
    const direction =
      params.direction ?? (chance(0.65) ? CallDirection.INBOUND : CallDirection.OUTBOUND);
    const externalNumber = params.externalNumber ?? randomPhoneE164();
    const ourNumber = params.ourNumber ?? process.env.EXOLVE_NUMBER ?? '+74951234567';
    const speed = params.speed && params.speed > 0 ? params.speed : 1;

    const fromNumber = direction === CallDirection.INBOUND ? externalNumber : ourNumber;
    const toNumber = direction === CallDirection.INBOUND ? ourNumber : externalNumber;

    const startedAt = new Date();
    const base = {
      externalId,
      direction: direction as 'INBOUND' | 'OUTBOUND',
      fromNumber,
      toNumber,
      startedAt,
      ...(params.extension ? { extension: params.extension } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
    };

    // 1. Дозвон — виден в журнале сразу
    await ingestCallEvent(
      {
        ...base,
        type: 'ringing',
        status: CallStatus.RINGING,
        raw: { scenario: 'mock', step: 'ringing' },
      },
      this.name,
    );

    const ringSeconds = randomInt(3, 8);
    const answered = !chance(0.15); // доля пропущенных ~15%
    const talkSeconds = randomInt(20, 75);

    const schedule = (fn: () => Promise<void>, delaySeconds: number) => {
      const timer = setTimeout(
        () => {
          void fn().catch((err) => logger.error({ err, externalId }, 'mock scenario step failed'));
        },
        (delaySeconds * 1000) / speed,
      );
      // Не держим процесс живым ради демо-таймера
      if (typeof timer.unref === 'function') timer.unref();
    };

    if (!answered) {
      schedule(async () => {
        const endedAt = new Date(startedAt.getTime() + ringSeconds * 1000);
        await ingestCallEvent(
          {
            ...base,
            type: 'failed',
            status: direction === CallDirection.INBOUND ? CallStatus.MISSED : CallStatus.NO_ANSWER,
            endedAt,
            waitSeconds: ringSeconds,
            durationSeconds: 0,
            raw: { scenario: 'mock', step: 'no-answer' },
          },
          this.name,
        );
      }, ringSeconds);

      return { externalId, startedAt };
    }

    // 2. Ответ — статус «Разговор», таймер длительности пошёл
    schedule(async () => {
      const answeredAt = new Date(startedAt.getTime() + ringSeconds * 1000);
      await ingestCallEvent(
        {
          ...base,
          type: 'answered',
          status: CallStatus.IN_PROGRESS,
          answeredAt,
          waitSeconds: ringSeconds,
          raw: { scenario: 'mock', step: 'answered' },
        },
        this.name,
      );
    }, ringSeconds);

    // 3. Завершение — появляется длительность и запись разговора
    schedule(async () => {
      const answeredAt = new Date(startedAt.getTime() + ringSeconds * 1000);
      const endedAt = new Date(answeredAt.getTime() + talkSeconds * 1000);
      await ingestCallEvent(
        {
          ...base,
          type: 'completed',
          status: CallStatus.COMPLETED,
          answeredAt,
          endedAt,
          waitSeconds: ringSeconds,
          durationSeconds: talkSeconds,
          recordingUrl: MOCK_RECORDING_URL,
          raw: { scenario: 'mock', step: 'completed' },
        },
        this.name,
      );
    }, ringSeconds + talkSeconds);

    return { externalId, startedAt };
  }
}
