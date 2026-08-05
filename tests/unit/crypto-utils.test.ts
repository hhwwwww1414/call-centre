import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decrypt, encrypt, generateToken, hashToken, safeCompare } from '@/lib/crypto';
import { buildListenerConfig } from '@/lib/realtime/pg-config';
import { formatDuration, formatDurationWords, percent, plural } from '@/lib/utils';

describe('шифрование настроек (AES-256-GCM)', () => {
  const ENV = { ...process.env };

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('расшифровка возвращает исходную строку', () => {
    const secret = 'ключ-провайдера-42';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('один и тот же текст шифруется каждый раз по-разному', () => {
    // Случайный IV: одинаковый шифротекст выдал бы повторы значений
    expect(encrypt('одно и то же')).not.toBe(encrypt('одно и то же'));
  });

  it('подделанный шифротекст не расшифровывается', () => {
    const encrypted = encrypt('секрет');
    const tampered = `${encrypted.slice(0, -4)}AAAA`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('без ключа шифрование отказывает понятной ошибкой', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY/);
  });

  it('ключ неверной длины не принимается', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    expect(() => encrypt('x')).toThrow(/32 байта/);
  });
});

describe('токены приглашений', () => {
  it('токен каждый раз новый и достаточно длинный', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
    expect(generateToken().length).toBeGreaterThanOrEqual(40);
  });

  it('в БД уходит хеш, а не сам токен', () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).toBe(hash);
  });
});

describe('safeCompare', () => {
  it('сравнивает строки на равенство', () => {
    expect(safeCompare('секрет', 'секрет')).toBe(true);
    expect(safeCompare('секрет', 'секреТ')).toBe(false);
  });

  it('разная длина не приводит к исключению', () => {
    expect(safeCompare('короткий', 'значительно-длиннее')).toBe(false);
  });
});

describe('buildListenerConfig', () => {
  it('снимает проверку сертификата для sslmode=prefer', () => {
    // Managed-база отдаёт самоподписанный сертификат: node-postgres
    // без этого падает с DEPTH_ZERO_SELF_SIGNED_CERT
    const config = buildListenerConfig('postgresql://u:p@host:5432/db?sslmode=prefer');
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('sslmode=disable полностью выключает TLS', () => {
    const config = buildListenerConfig('postgresql://u:p@host:5432/db?sslmode=disable');
    expect(config.ssl).toBe(false);
  });

  it('verify-full требует доверенной цепочки', () => {
    const config = buildListenerConfig('postgresql://u:p@host:5432/db?sslmode=verify-full');
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('вычищает параметры Prisma из строки подключения', () => {
    const config = buildListenerConfig(
      'postgresql://u:p@host:5432/db?schema=public&sslmode=prefer&connection_limit=10',
    );
    expect(config.connectionString).not.toContain('connection_limit');
    expect(config.connectionString).not.toContain('schema=');
    expect(config.connectionString).not.toContain('sslmode');
  });

  it('держит соединение живым — иначе слушатель молча отвалится', () => {
    const config = buildListenerConfig('postgresql://u:p@host:5432/db');
    expect(config.keepAlive).toBe(true);
  });
});

describe('форматирование для интерфейса', () => {
  it('длительность выравнивается по колонке', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
  });

  it('словесная длительность читается человеком', () => {
    expect(formatDurationWords(0)).toBe('0 с');
    expect(formatDurationWords(45)).toBe('45 с');
    expect(formatDurationWords(120)).toBe('2 мин');
    expect(formatDurationWords(125)).toBe('2 мин 5 с');
  });

  it('русское множественное число не выдаёт «2 звонков»', () => {
    expect(plural(1, 'звонок', 'звонка', 'звонков')).toBe('звонок');
    expect(plural(2, 'звонок', 'звонка', 'звонков')).toBe('звонка');
    expect(plural(5, 'звонок', 'звонка', 'звонков')).toBe('звонков');
    expect(plural(11, 'звонок', 'звонка', 'звонков')).toBe('звонков');
    expect(plural(21, 'звонок', 'звонка', 'звонков')).toBe('звонок');
    // 112 — «сто двенадцать»: подростковый десяток забирает форму «звонков»
    expect(plural(112, 'звонок', 'звонка', 'звонков')).toBe('звонков');
    expect(plural(102, 'звонок', 'звонка', 'звонков')).toBe('звонка');
    expect(plural(0, 'звонок', 'звонка', 'звонков')).toBe('звонков');
  });

  it('процент от нуля не даёт NaN на дашборде', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(3, 10)).toBe(30);
  });
});
