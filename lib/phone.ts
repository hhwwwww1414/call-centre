import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

const DEFAULT_COUNTRY: CountryCode = 'RU';

/**
 * Нормализация в E.164 на входе (ТЗ 4). Всё, что не разобралось,
 * возвращается как есть, но очищенным — терять номер нельзя, звонок важнее
 * красоты формата.
 */
export function toE164(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';

  const parsed = parsePhoneNumberFromString(raw, DEFAULT_COUNTRY);
  if (parsed?.isValid()) return parsed.number;

  const digits = raw.replace(/[^\d+]/g, '');
  // 8XXXXXXXXXX → +7XXXXXXXXXX
  if (/^8\d{10}$/.test(digits)) return `+7${digits.slice(1)}`;
  if (/^7\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+7${digits}`;
  return digits.startsWith('+') ? digits : digits ? `+${digits}` : '';
}

/** Отображение: +7 (999) 123-45-67. Короткие внутренние номера — как есть. */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return '—';
  const raw = String(input).trim();
  if (!raw) return '—';
  if (raw.replace(/\D/g, '').length <= 6) return raw; // добавочный

  const parsed = parsePhoneNumberFromString(raw, DEFAULT_COUNTRY);
  if (parsed?.isValid()) {
    if (parsed.country === 'RU' || parsed.countryCallingCode === '7') {
      const national = parsed.nationalNumber;
      if (national.length === 10) {
        return `+7 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8)}`;
      }
    }
    return parsed.formatInternational();
  }
  return raw;
}

export function isValidPhone(input: string | null | undefined): boolean {
  if (!input) return false;
  const parsed = parsePhoneNumberFromString(String(input).trim(), DEFAULT_COUNTRY);
  return Boolean(parsed?.isValid());
}

/** Строка для tel:-ссылки (кнопка «Позвонить» на мобильных). */
export function telHref(input: string | null | undefined): string {
  const e164 = toE164(input);
  return e164 ? `tel:${e164}` : '#';
}

/** Маска для поиска: убираем всё, кроме цифр, чтобы искать по любому вводу. */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}
