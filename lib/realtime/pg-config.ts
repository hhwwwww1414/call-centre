import { readFileSync } from 'node:fs';

import type { ClientConfig } from 'pg';

/**
 * Конфиг подключения слушателя к Postgres.
 *
 * Зачем отдельно от Prisma: node-postgres и движок Prisma по-разному читают
 * `sslmode`. Prisma при `prefer`/`require` шифрует канал, но не проверяет
 * сертификат; node-postgres при том же URL требует доверенную цепочку и на
 * managed-базе с самоподписанным сертификатом падает с
 * DEPTH_ZERO_SELF_SIGNED_CERT. Приводим поведение к prisma-совместимому.
 */
export function buildListenerConfig(databaseUrl: string): ClientConfig {
  const url = new URL(databaseUrl);
  const mode = (url.searchParams.get('sslmode') ?? 'prefer').toLowerCase();

  // Параметры Prisma не нужны node-postgres и только мешают
  for (const key of ['sslmode', 'connection_limit', 'schema', 'pool_timeout', 'connect_timeout']) {
    url.searchParams.delete(key);
  }

  const config: ClientConfig = {
    connectionString: url.toString(),
    keepAlive: true,
    application_name: 'vin2win-crm-listener',
  };

  if (mode === 'disable') {
    config.ssl = false;
    return config;
  }

  const caPath = process.env.PGSSLROOTCERT;
  const ca = caPath ? tryReadFile(caPath) : undefined;

  if (mode === 'verify-ca' || mode === 'verify-full') {
    config.ssl = { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
    return config;
  }

  // prefer | require | allow — шифруем канал, но не требуем доверенной цепочки.
  // Если CA передан явно, проверяем по нему.
  config.ssl = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false };
  return config;
}

function tryReadFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}
