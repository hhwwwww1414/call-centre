import { expect, test } from '@playwright/test';

import { ADMIN, requireCredentials, signIn } from './helpers';

test.describe('Вход и доступ', () => {
  test('анонимного пользователя уводит на /login', async ({ page }) => {
    await page.goto('/calls');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Вход в CRM' })).toBeVisible();
  });

  test('публичной регистрации нет', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Аккаунты создаёт администратор')).toBeVisible();
    await expect(page.getByRole('link', { name: /регистр/i })).toHaveCount(0);
  });

  test('неверный пароль не выдаёт, существует ли пользователь', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#login-email').fill('never-existed@vin2win.online');
    await page.locator('#login-password').fill('заведомо-неверный-пароль');
    await page.locator('button[type=submit]').click();

    // На странице живёт ещё и служебный announcer с role=alert,
    // поэтому целимся в конкретный текст, а не в роль вообще
    await expect(page.getByText('Неверный e-mail или пароль')).toBeVisible();
  });

  test('API без сессии отвечает 401, а не пустыми данными', async ({ request }) => {
    for (const url of ['/api/calls', '/api/stats', '/api/contacts']) {
      const response = await request.get(url);
      expect(response.status(), url).toBe(401);
    }
  });

  test('админ входит и попадает на дашборд', async ({ page }) => {
    test.skip(!requireCredentials(ADMIN), 'не заданы E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

    await signIn(page, ADMIN);
    await expect(page).toHaveURL(/\/$|\/profile\/password/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
