import { expect, type Page } from '@playwright/test';

/**
 * Учётные данные для e2e задаются переменными окружения — в репозитории
 * паролей нет даже тестовых.
 */
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? '',
  password: process.env.E2E_ADMIN_PASSWORD ?? '',
};

export const MANAGER = {
  email: process.env.E2E_MANAGER_EMAIL ?? '',
  password: process.env.E2E_MANAGER_PASSWORD ?? '',
};

export function requireCredentials(who: { email: string; password: string }) {
  return Boolean(who.email && who.password);
}

export async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await page.locator('#login-email').fill(who.email);
  await page.locator('#login-password').fill(who.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

export async function currentUser(page: Page) {
  const response = await page.request.get('/api/auth/session');
  const body = (await response.json()) as { user?: { id: string; role: string } };
  return body.user ?? null;
}

/** Ждёт, пока в журнале появится строка с заданным текстом статуса. */
export async function expectStatusInFirstRow(page: Page, status: string) {
  await expect(page.locator('tbody tr').first()).toContainText(status, { timeout: 60_000 });
}
