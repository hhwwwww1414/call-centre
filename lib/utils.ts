import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Инициалы для аватара: «Иван Петров» → «ИП». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${(parts[0] ?? '').charAt(0)}${(parts[1] ?? '').charAt(0)}`.toUpperCase();
}

/** 125 → «2:05», 3725 → «1:02:05». Для колонок длительности. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || Number.isNaN(totalSeconds) || totalSeconds < 0) return '—';
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, '0')}`
    : `${mm}:${String(seconds).padStart(2, '0')}`;
}

/** «2 мин 5 с» — для мест, где важна читаемость, а не выравнивание. */
export function formatDurationWords(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds <= 0) return '0 с';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  if (m === 0) return `${s} с`;
  if (s === 0) return `${m} мин`;
  return `${m} мин ${s} с`;
}

/** Русская форма множественного числа: plural(2, 'звонок','звонка','звонков'). */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function pluralWithCount(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Процент с защитой от деления на ноль. */
export function percent(part: number, total: number, digits = 0): number {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(digits));
}
