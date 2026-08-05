import { expect, test } from '@playwright/test';

import { ADMIN, requireCredentials, signIn } from './helpers';

/** Критерий приёмки 6: обе темы работают, вспышки чужой темы нет. */
test.describe('Темы', () => {
  test('тема из cookie применяется сразу в SSR-разметке', async ({ page, context, baseURL }) => {
    // url берём из baseURL: с захардкоженным адресом кука не привязывалась
    // к боевому домену и тест молча проверял тему по умолчанию
    await context.addCookies([{ name: 'vin2win.theme', value: 'dark', url: baseURL! }]);
    await page.goto('/login');

    // Класс должен стоять на body уже в первом ответе сервера
    await expect(page.locator('body')).toHaveClass(/theme-dark/);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(10, 10, 10)');
  });

  test('светлая тема отдаёт светлый фон', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'vin2win.theme', value: 'light', url: baseURL! }]);
    await page.goto('/login');

    await expect(page.locator('body')).toHaveClass(/theme-light/);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(255, 255, 255)');
  });

  test('инлайновый скрипт темы не бросает ошибок в консоль', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/login');
    expect(errors).toEqual([]);
  });
});

/** Критерий приёмки 7: на 375px ничего не уезжает за край. */
test.describe('Мобильный вид', () => {
  test.skip(!requireCredentials(ADMIN), 'не заданы E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

  test('журнал звонков на телефоне читается как список карточек', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'сценарий только для мобильного проекта');

    await signIn(page, ADMIN);
    await page.goto('/calls');

    // Таблица на телефоне скрыта, вместо неё карточки
    await expect(page.locator('table')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows, 'горизонтального скролла быть не должно').toBe(false);
  });

  test('фильтры открываются нижним листом', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'сценарий только для мобильного проекта');

    await signIn(page, ADMIN);
    await page.goto('/calls');

    await page.getByRole('button', { name: 'Фильтры' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Показать' })).toBeVisible();
  });

  test('интерактивные элементы не меньше 44px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'сценарий только для мобильного проекта');

    await signIn(page, ADMIN);
    await page.goto('/calls');

    const navLinks = page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link');
    const count = await navLinks.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i += 1) {
      const box = await navLinks.nth(i).boundingBox();
      expect(box?.height ?? 0, `пункт ${i}`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('Служебные страницы', () => {
  test('/api/health отвечает и сообщает состояние БД', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe(true);
    expect(body).toHaveProperty('version');
  });

  test('приложение закрыто от индексации', async ({ request }) => {
    const response = await request.get('/login');
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  });

  test('вебхук выключенного провайдера отвечает 503 с понятным телом', async ({ request }) => {
    const response = await request.post('/api/webhooks/exolve', { data: {} });
    // 503 — когда активен mock; 401 — когда exolve включён, но подпись не сошлась
    expect([401, 503]).toContain(response.status());
    if (response.status() === 503) {
      const body = await response.json();
      expect(body.message).toContain('выключен');
    }
  });
});
