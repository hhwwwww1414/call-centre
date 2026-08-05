import { hash, verify } from '@node-rs/argon2';

/**
 * Algorithm в @node-rs/argon2 объявлен как ambient const enum — при
 * isolatedModules его нельзя импортировать, поэтому берём значение напрямую.
 */
export const ARGON2ID = 2;

/** Параметры argon2id: OWASP-профиль (19 МиБ, 2 итерации, 1 поток). */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, OPTIONS);
  } catch {
    // Битый или чужого формата хеш — это «не подошло», а не 500-я ошибка
    return false;
  }
}

/**
 * Постоянная по времени заглушка: прогоняем argon2 даже когда пользователь
 * не найден, иначе по времени ответа можно перебрать существующие логины.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zdGF0aWMtc2FsdA$3wLD4pDMSPPTS3PbF1VbEcMh0EWZbCg3jsFtx1KY0Ng';

export async function fakeVerify(password: string): Promise<void> {
  await verifyPassword(DUMMY_HASH, password);
}

/** Стартовый пароль для запасного сценария выдачи доступа (ТЗ 3.3). */
export function generateOneTimePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
