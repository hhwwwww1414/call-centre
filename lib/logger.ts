import pino from 'pino';

/**
 * Структурированные JSON-логи. Секреты не логируются: всё, что похоже на
 * пароль/токен/ключ, вырезается на уровне redact — до сериализации.
 */
const redactPaths = [
  'password',
  'passwordHash',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.tokenHash',
  'token',
  'tokenHash',
  'apiKey',
  'secret',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'DATABASE_URL',
  'AUTH_SECRET',
  'ENCRYPTION_KEY',
  'EXOLVE_API_KEY',
  'EXOLVE_WEBHOOK_SECRET',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: redactPaths, censor: '[скрыто]' },
  base: { service: 'vin2win-crm' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
    : {}),
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
