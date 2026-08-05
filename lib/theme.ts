/**
 * Константы темы живут в обычном модуле, а не в 'use client'-файле:
 * иначе при импорте с сервера они превращаются в client-reference и
 * подставляются в инлайновый скрипт как заглушки-функции.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'vin2win.theme';
export const THEME_COOKIE = 'vin2win.theme';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}
