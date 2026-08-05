import { CallStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExolveTelephonyProvider } from '@/lib/telephony/providers/exolve';
import {
  callsForDate,
  generateCall,
  randomPhoneE164,
  randomTalkDuration,
} from '@/lib/telephony/mock-data';

describe('mock-генератор', () => {
  it('выдаёт валидные российские мобильные номера', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(randomPhoneE164()).toMatch(/^\+79\d{9}$/);
    }
  });

  it('длительность разговора логнормальная со средним около 2,5 минут', () => {
    const samples = Array.from({ length: 5000 }, () => randomTalkDuration());
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    // Среднее «около 150 с» — с запасом на случайность выборки
    expect(mean).toBeGreaterThan(110);
    expect(mean).toBeLessThan(210);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...samples)).toBeLessThanOrEqual(3600);
  });

  it('доля пропущенных держится около 15%', () => {
    const day = new Date('2026-03-10T00:00:00');
    const calls = Array.from({ length: 4000 }, () => generateCall(day));
    const missed = calls.filter(
      (call) => call.status === CallStatus.MISSED || call.status === CallStatus.NO_ANSWER,
    ).length;
    const share = missed / calls.length;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.21);
  });

  it('у отвеченного звонка ответ не раньше начала, а конец не раньше ответа', () => {
    const day = new Date('2026-03-10T00:00:00');
    for (let i = 0; i < 500; i += 1) {
      const call = generateCall(day);
      expect(call.endedAt.getTime()).toBeGreaterThanOrEqual(call.startedAt.getTime());
      if (call.answeredAt) {
        expect(call.answeredAt.getTime()).toBeGreaterThanOrEqual(call.startedAt.getTime());
        expect(call.endedAt.getTime()).toBeGreaterThanOrEqual(call.answeredAt.getTime());
        expect(call.durationSeconds).toBeGreaterThan(0);
      } else {
        expect(call.durationSeconds).toBe(0);
      }
    }
  });

  it('в воскресенье звонков заметно меньше, чем в будни', () => {
    const wednesday = new Date('2026-03-11T00:00:00'); // среда
    const sunday = new Date('2026-03-15T00:00:00'); // воскресенье
    const avg = (date: Date) =>
      Array.from({ length: 400 }, () => callsForDate(date, 50)).reduce((a, b) => a + b, 0) / 400;
    expect(avg(sunday)).toBeLessThan(avg(wednesday) / 2);
  });
});

describe('ExolveTelephonyProvider', () => {
  const ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.EXOLVE_API_KEY;
    delete process.env.EXOLVE_NUMBER;
    delete process.env.EXOLVE_WEBHOOK_SECRET;
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('без ключей считается ненастроенным и честно об этом сообщает', async () => {
    const provider = new ExolveTelephonyProvider();
    expect(provider.isConfigured()).toBe(false);
    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.message).toContain('EXOLVE_API_KEY');
  });

  it('переключение на exolve без настроек не роняет приложение', () => {
    // Критерий приёмки 14: экран телефонии должен просто показать «не настроено»
    const provider = new ExolveTelephonyProvider();
    expect(() => provider.configState()).not.toThrow();
    expect(provider.configState().EXOLVE_API_KEY).toBe(false);
  });

  it('без секрета вебхука подпись не принимается', () => {
    const provider = new ExolveTelephonyProvider();
    expect(provider.verifyWebhook({ rawBody: '{}', headers: {} })).toBe(false);
  });

  it('подпись сходится только при точном совпадении секрета', () => {
    process.env.EXOLVE_WEBHOOK_SECRET = 'секрет-вебхука';
    const provider = new ExolveTelephonyProvider();
    expect(
      provider.verifyWebhook({ rawBody: '{}', headers: { 'x-exolve-signature': 'секрет-вебхука' } }),
    ).toBe(true);
    expect(
      provider.verifyWebhook({ rawBody: '{}', headers: { 'x-exolve-signature': 'не-тот' } }),
    ).toBe(false);
    expect(
      provider.verifyWebhook({ rawBody: '{}', headers: { authorization: 'Bearer секрет-вебхука' } }),
    ).toBe(true);
  });

  it('разбирает событие завершения звонка в нашу модель', () => {
    process.env.EXOLVE_NUMBER = '+74951234567';
    const provider = new ExolveTelephonyProvider();
    const event = provider.parseEvent({
      call_id: 'abc-123',
      event: 'hangup',
      from: '+79991234567',
      to: '+74951234567',
      extension: '101',
      started_at: '2026-03-15T10:00:00Z',
      answered_at: '2026-03-15T10:00:05Z',
      ended_at: '2026-03-15T10:02:00Z',
      duration: 115,
      record_url: 'https://example.test/record.mp3',
    });

    expect(event).not.toBeNull();
    expect(event?.externalId).toBe('abc-123');
    expect(event?.type).toBe('completed');
    expect(event?.status).toBe(CallStatus.COMPLETED);
    expect(event?.direction).toBe('INBOUND');
    expect(event?.extension).toBe('101');
    expect(event?.durationSeconds).toBe(115);
    expect(event?.recordingUrl).toBe('https://example.test/record.mp3');
  });

  it('входящий без ответа становится MISSED, исходящий — NO_ANSWER', () => {
    process.env.EXOLVE_NUMBER = '+74951234567';
    const provider = new ExolveTelephonyProvider();

    const inbound = provider.parseEvent({
      call_id: '1',
      event: 'noanswer',
      from: '+79991234567',
      to: '+74951234567',
    });
    expect(inbound?.status).toBe(CallStatus.MISSED);

    const outbound = provider.parseEvent({
      call_id: '2',
      event: 'noanswer',
      direction: 'outbound',
      from: '+74951234567',
      to: '+79991234567',
    });
    expect(outbound?.status).toBe(CallStatus.NO_ANSWER);
  });

  it('событие без идентификатора звонка отбрасывается, а не ломает обработчик', () => {
    const provider = new ExolveTelephonyProvider();
    expect(provider.parseEvent({ event: 'hangup' })).toBeNull();
    expect(provider.parseEvent(null)).toBeNull();
    expect(provider.parseEvent('строка')).toBeNull();
  });

  it('неизвестный тип события не превращается в мусорный звонок', () => {
    const provider = new ExolveTelephonyProvider();
    expect(provider.parseEvent({ call_id: '1', event: 'что-то новое' })).toBeNull();
  });
});
