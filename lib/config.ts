/** Публичный адрес приложения — для ссылок-приглашений и URL вебхука. */
export function appUrl(): string {
  const raw =
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

export function buildVersion(): string {
  return process.env.BUILD_VERSION || 'dev';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
