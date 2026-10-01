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

    // На экране входа только логотип, заголовок и форма — ни ссылки на
    // регистрацию, ни восстановления пароля быть не должно
    await expect(page.getByRole('link', { name: /регистр/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /забыл|восстанов/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Вход в CRM' })).toBeVisible();
  });

  test('на экране входа показан логотип VIN2WIN', async ({ page }) => {
    await page.goto('/login');
    const logo = page.getByRole('img', { name: 'VIN2WIN' });
    await expect(logo).toBeVisible();

    // Картинка должна реально загрузиться, а не остаться битой ссылкой
    const loaded = await logo.evaluate(
      (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
    );
    expect(loaded).toBe(true);
  });

  test('неверный пароль не выдаёт, существует ли пользователь', async ({ page }) => {
    // Адрес уникален для каждого прогона: с постоянным тест сам себя
    // заблокировал бы — 5 неудачных попыток за 15 минут, и вместо
    // «неверный пароль» приходит сообщение о превышении лимита
    const email = `never-existed-${Date.now()}@vin2win.online`;

    await page.goto('/login');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill('заведомо-неверный-пароль');
    await page.locator('button[type=submit]').click();

    // На странице живёт ещё и служебный announcer с role=alert,
    // поэтому целимся в конкретный текст, а не в роль вообще
    await expect(page.getByText('Неверный e-mail или пароль')).toBeVisible();
  });

  test('перебор паролей упирается в лимит попыток', async ({ page }) => {
    const email = `bruteforce-${Date.now()}@vin2win.online`;

    await page.goto('/login');
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await page.locator('#login-email').fill(email);
      await page.locator('#login-password').fill(`подбор-${attempt}`);
      await page.locator('button[type=submit]').click();
      await expect(page.getByRole('alert').first()).toBeVisible();
    }

    // Шестая попытка должна упереться в лимит 5 за 15 минут (ТЗ 3.4)
    await expect(page.getByText('Слишком много попыток входа')).toBeVisible();
  });

  test('API без сессии отвечает 401, а не пустыми данными', async ({ request }) => {
    for (const url of ['/api/calls', '/api/stats', '/api/contacts']) {
      const response = await request.get(url);
      expect(response.status(), url).toBe(401);
    }
  });

  test('API приглашения доступен без входа', async ({ request }) => {
    const response = await request.get('/api/invite/invalid-token');
    expect(response.status()).toBe(410);
    expect((await response.json()).error).toBe('invite_invalid');
  });

  test('админ входит и попадает на дашборд', async ({ page }) => {
    test.skip(!requireCredentials(ADMIN), 'не заданы E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

    await signIn(page, ADMIN);
    await expect(page).toHaveURL(/\/$|\/profile\/password/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
