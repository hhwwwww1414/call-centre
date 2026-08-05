import { expect, test } from '@playwright/test';

import { ADMIN, currentUser, MANAGER, requireCredentials, signIn } from './helpers';

/** Критерии приёмки 4 и 5: изоляция данных и закрытая админка. */
test.describe('Изоляция данных менеджера', () => {
  test.skip(
    !requireCredentials(MANAGER),
    'не заданы E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD',
  );

  test('менеджер не видит чужие звонки даже с подставленным userId', async ({ page }) => {
    await signIn(page, MANAGER);
    const me = await currentUser(page);
    expect(me).not.toBeNull();

    const own = await (await page.request.get('/api/calls?preset=30d&limit=50')).json();
    const foreignOwners = own.items.filter(
      (item: { user: { id: string } | null }) => item.user && item.user.id !== me?.id,
    );
    expect(foreignOwners, 'в своей выдаче не должно быть чужих звонков').toHaveLength(0);

    // Подставляем чужой userId — сервер обязан его проигнорировать
    const forged = await (
      await page.request.get('/api/calls?preset=30d&limit=50&userId=someone-else')
    ).json();
    const leaked = forged.items.filter(
      (item: { user: { id: string } | null }) => item.user && item.user.id !== me?.id,
    );
    expect(leaked, 'подстановка чужого userId не должна открывать чужие звонки').toHaveLength(0);
  });

  test('менеджер получает 403 на /admin/*, а не пустой экран', async ({ page }) => {
    await signIn(page, MANAGER);

    const response = await page.goto('/admin/users');
    expect(response?.status()).toBe(403);
    await expect(page.getByText('Доступ закрыт')).toBeVisible();
  });

  test('админские API закрыты для менеджера', async ({ page }) => {
    await signIn(page, MANAGER);

    for (const url of [
      '/api/users',
      '/api/audit',
      '/api/analytics',
      '/api/admin/telephony',
      '/api/calls/export',
    ]) {
      const response = await page.request.get(url);
      expect(response.status(), url).toBe(403);
    }

    const create = await page.request.post('/api/users', {
      data: { name: 'Взлом Взломов', email: 'hack@example.test', role: 'ADMIN' },
    });
    expect(create.status()).toBe(403);
  });

  test('в сайдбаре менеджера нет административных разделов', async ({ page }) => {
    await signIn(page, MANAGER);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Пользователи' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Телефония' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Звонки' })).toBeVisible();
  });
});

test.describe('Права администратора', () => {
  test.skip(!requireCredentials(ADMIN), 'не заданы E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

  test('админ открывает все разделы администрирования', async ({ page }) => {
    await signIn(page, ADMIN);

    for (const path of ['/admin/users', '/admin/analytics', '/admin/telephony', '/admin/audit']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
    }
  });
});
