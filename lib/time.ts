import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import type { PeriodPreset } from '@/lib/validation';

/**
 * Все метки хранятся в UTC, показываются в таймзоне пользователя (ТЗ 4).
 * date-fns-tz не тянем: нужного хватает Intl, который уже есть в рантайме.
 */

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsIn(date: Date, timeZone: string): DateParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }

  return {
    year: map.year ?? 1970,
    month: map.month ?? 1,
    day: map.day ?? 1,
    // Полночь Intl отдаёт как 24 при hour12:false
    hour: (map.hour ?? 0) % 24,
    minute: map.minute ?? 0,
    second: map.second ?? 0,
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** UTC-момент, соответствующий началу суток в указанной таймзоне. */
export function startOfDayInZone(date: Date, timeZone: string): Date {
  const p = partsIn(date, timeZone);
  const utcMidnight = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0);
  // Два прохода: второй поправляет краевые случаи перевода часов
  let result = utcMidnight - offsetMs(new Date(utcMidnight), timeZone);
  result = utcMidnight - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

export function endOfDayInZone(date: Date, timeZone: string): Date {
  const start = startOfDayInZone(date, timeZone);
  return new Date(startOfDayInZone(new Date(start.getTime() + 36 * 3600_000), timeZone).getTime() - 1);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export type ResolvedPeriod = {
  from: Date;
  to: Date;
  preset: PeriodPreset;
  /** Показывать ли график по часам (для одного дня) или по дням. */
  granularity: 'hour' | 'day';
};

/** Пресеты периода из ТЗ 5.3: Сегодня / Вчера / 7 дней / 30 дней / диапазон. */
export function resolvePeriod(
  preset: PeriodPreset,
  timeZone: string,
  fromIso?: string,
  toIso?: string,
): ResolvedPeriod {
  const now = new Date();

  switch (preset) {
    case 'today':
      return {
        preset,
        from: startOfDayInZone(now, timeZone),
        to: endOfDayInZone(now, timeZone),
        granularity: 'hour',
      };
    case 'yesterday': {
      const yesterday = addDays(now, -1);
      return {
        preset,
        from: startOfDayInZone(yesterday, timeZone),
        to: endOfDayInZone(yesterday, timeZone),
        granularity: 'hour',
      };
    }
    case '7d':
      return {
        preset,
        from: startOfDayInZone(addDays(now, -6), timeZone),
        to: endOfDayInZone(now, timeZone),
        granularity: 'day',
      };
    case '30d':
      return {
        preset,
        from: startOfDayInZone(addDays(now, -29), timeZone),
        to: endOfDayInZone(now, timeZone),
        granularity: 'day',
      };
    case 'custom': {
      const from = fromIso ? new Date(fromIso) : startOfDayInZone(addDays(now, -6), timeZone);
      const to = toIso ? new Date(toIso) : endOfDayInZone(now, timeZone);
      const sameDay = to.getTime() - from.getTime() <= 86_400_000;
      return { preset, from, to, granularity: sameDay ? 'hour' : 'day' };
    }
  }
}

/** Форматирование для интерфейса — всегда в таймзоне пользователя. */
export function formatInZone(
  date: Date | string | null | undefined,
  timeZone: string,
  style: 'time' | 'datetime' | 'date' | 'short' = 'datetime',
): string {
  if (!date) return '—';
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '—';

  const options: Intl.DateTimeFormatOptions =
    style === 'time'
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : style === 'date'
        ? { day: '2-digit', month: '2-digit', year: 'numeric' }
        : style === 'short'
          ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
          : { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };

  return new Intl.DateTimeFormat('ru-RU', { timeZone, hour12: false, ...options }).format(value);
}

/** «5 минут назад», «вчера» — для очереди «нужно перезвонить». */
export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const value = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - value.getTime();
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 30) return `${days} дн назад`;
  return format(value, 'd MMMM yyyy', { locale: ru });
}

export function isoDayLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : format(date, 'd MMM', { locale: ru });
}

export const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;
