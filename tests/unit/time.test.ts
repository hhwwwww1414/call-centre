import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { endOfDayInZone, formatInZone, resolvePeriod, startOfDayInZone } from '@/lib/time';

const MOSCOW = 'Europe/Moscow';

describe('startOfDayInZone', () => {
  it('начало московских суток — это 21:00 UTC предыдущего дня', () => {
    // 15 марта 2026, 10:30 UTC = 13:30 в Москве
    const start = startOfDayInZone(new Date('2026-03-15T10:30:00Z'), MOSCOW);
    expect(start.toISOString()).toBe('2026-03-14T21:00:00.000Z');
  });

  it('момент прямо на границе суток не уезжает на день назад', () => {
    // 21:00:00 UTC — это уже 00:00 следующего дня по Москве
    const start = startOfDayInZone(new Date('2026-03-14T21:00:00Z'), MOSCOW);
    expect(start.toISOString()).toBe('2026-03-14T21:00:00.000Z');
  });

  it('учитывает смещение зоны, а не локаль сервера', () => {
    const moscow = startOfDayInZone(new Date('2026-03-15T10:30:00Z'), MOSCOW);
    const vladivostok = startOfDayInZone(new Date('2026-03-15T10:30:00Z'), 'Asia/Vladivostok');
    expect(vladivostok.toISOString()).toBe('2026-03-14T14:00:00.000Z');
    expect(moscow.getTime()).not.toBe(vladivostok.getTime());
  });
});

describe('endOfDayInZone', () => {
  it('конец суток — на миллисекунду раньше начала следующих', () => {
    const end = endOfDayInZone(new Date('2026-03-15T10:30:00Z'), MOSCOW);
    expect(end.toISOString()).toBe('2026-03-15T20:59:59.999Z');
  });
});

describe('resolvePeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T10:30:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('«сегодня» — это ровно одни сутки в зоне пользователя', () => {
    const period = resolvePeriod('today', MOSCOW);
    expect(period.from.toISOString()).toBe('2026-03-14T21:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-03-15T20:59:59.999Z');
    expect(period.granularity).toBe('hour');
  });

  it('«вчера» сдвигает окно ровно на сутки назад', () => {
    const period = resolvePeriod('yesterday', MOSCOW);
    expect(period.from.toISOString()).toBe('2026-03-13T21:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-03-14T20:59:59.999Z');
  });

  it('«7 дней» включает сегодняшний день, то есть 7 суток, а не 8', () => {
    const period = resolvePeriod('7d', MOSCOW);
    expect(period.from.toISOString()).toBe('2026-03-08T21:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-03-15T20:59:59.999Z');
    expect(period.granularity).toBe('day');
  });

  it('«30 дней» тоже считает сегодня включительно', () => {
    const period = resolvePeriod('30d', MOSCOW);
    expect(period.from.toISOString()).toBe('2026-02-13T21:00:00.000Z');
  });

  it('произвольный диапазон в пределах суток показывает разбивку по часам', () => {
    const period = resolvePeriod(
      'custom',
      MOSCOW,
      '2026-03-10T00:00:00.000Z',
      '2026-03-10T18:00:00.000Z',
    );
    expect(period.granularity).toBe('hour');
  });

  it('широкий произвольный диапазон переключается на дни', () => {
    const period = resolvePeriod(
      'custom',
      MOSCOW,
      '2026-03-01T00:00:00.000Z',
      '2026-03-10T00:00:00.000Z',
    );
    expect(period.granularity).toBe('day');
  });
});

describe('formatInZone', () => {
  it('показывает время в зоне пользователя, а не сервера', () => {
    const utcNoon = new Date('2026-03-15T09:00:00Z');
    expect(formatInZone(utcNoon, MOSCOW, 'time')).toBe('12:00:00');
    expect(formatInZone(utcNoon, 'Asia/Vladivostok', 'time')).toBe('19:00:00');
  });

  it('пустое или битое значение показывает прочерком', () => {
    expect(formatInZone(null, MOSCOW)).toBe('—');
    expect(formatInZone('не дата', MOSCOW)).toBe('—');
  });
});
