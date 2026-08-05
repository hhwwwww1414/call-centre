import { describe, expect, it } from 'vitest';

import { digitsOnly, formatPhone, isValidPhone, telHref, toE164 } from '@/lib/phone';

describe('toE164', () => {
  it('приводит российские номера в любом виде к +7XXXXXXXXXX', () => {
    const expected = '+79991234567';
    for (const input of [
      '+7 (999) 123-45-67',
      '8 999 123 45 67',
      '89991234567',
      '79991234567',
      '9991234567',
      '+7-999-123-45-67',
      ' +7 999 1234567 ',
    ]) {
      expect(toE164(input), input).toBe(expected);
    }
  });

  it('не теряет номер, который не удалось разобрать', () => {
    // Потерять номер хуже, чем сохранить его в неидеальном формате
    expect(toE164('12345')).toBe('+12345');
    expect(toE164('abc')).toBe('');
  });

  it('пустой ввод даёт пустую строку, а не падение', () => {
    expect(toE164(null)).toBe('');
    expect(toE164(undefined)).toBe('');
    expect(toE164('   ')).toBe('');
  });
});

describe('formatPhone', () => {
  it('показывает российский номер человеку в привычном виде', () => {
    expect(formatPhone('+79991234567')).toBe('+7 (999) 123-45-67');
    expect(formatPhone('89991234567')).toBe('+7 (999) 123-45-67');
  });

  it('короткий внутренний номер оставляет как есть', () => {
    expect(formatPhone('101')).toBe('101');
  });

  it('пустое значение показывает прочерком', () => {
    expect(formatPhone(null)).toBe('—');
    expect(formatPhone('')).toBe('—');
  });
});

describe('isValidPhone', () => {
  it('отличает валидный мобильный от мусора', () => {
    expect(isValidPhone('+79991234567')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone(null)).toBe(false);
  });
});

describe('telHref', () => {
  it('строит ссылку для кнопки «Позвонить»', () => {
    expect(telHref('8 999 123-45-67')).toBe('tel:+79991234567');
    expect(telHref('')).toBe('#');
  });
});

describe('digitsOnly', () => {
  it('оставляет только цифры — по ним ищем в журнале', () => {
    expect(digitsOnly('+7 (999) 123-45-67')).toBe('79991234567');
  });
});
