import { expect, test } from '@playwright/test';

import { ADMIN, requireCredentials, signIn } from './helpers';

test.describe('Журнал звонков и realtime', () => {
  test.skip(!requireCredentials(ADMIN), 'не заданы E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN);
  });

  /** Критерии приёмки 8 и 9. */
  test('тестовый звонок появляется без перезагрузки и меняет статус вживую', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'сценарий проверяется на табличном представлении');
    test.setTimeout(180_000);

    await page.goto('/calls');
    await expect(page.locator('tbody tr').first()).toBeVisible();

    // Индикатор realtime должен позеленеть — иначе события просто не дойдут
    await expect(page.getByRole('status', { name: 'Обновления в реальном времени' })).toBeVisible({
      timeout: 30_000,
    });

    const created = await page.request.post('/api/admin/telephony/test-call', { data: {} });
    expect(created.status()).toBe(200);

    const firstRow = page.locator('tbody tr').first();
    // Дозвон → Разговор → Завершён, всё без единой перезагрузки страницы
    await expect(firstRow).toContainText('Дозвон', { timeout: 30_000 });
    await expect(firstRow).toContainText('Разговор', { timeout: 45_000 });
    await expect(firstRow).toContainText('Завершён', { timeout: 120_000 });
  });

  /** Критерий приёмки 10. */
  test('фильтры и поиск работают на сервере и не ломают пагинацию', async ({ page }) => {
    await page.goto('/calls?preset=30d');

    const all = await (await page.request.get('/api/calls?preset=30d&limit=50')).json();
    test.skip(all.total === 0, 'в базе нет звонков за период');

    const missed = await (
      await page.request.get('/api/calls?preset=30d&limit=50&status=MISSED')
    ).json();
    expect(missed.total).toBeLessThanOrEqual(all.total);
    for (const item of missed.items) expect(item.status).toBe('MISSED');

    const inbound = await (
      await page.request.get('/api/calls?preset=30d&limit=50&direction=INBOUND')
    ).json();
    for (const item of inbound.items) expect(item.direction).toBe('INBOUND');

    // Курсорная пагинация: вторая страница не повторяет первую
    if (all.nextCursor) {
      const second = await (
        await page.request.get(`/api/calls?preset=30d&limit=50&cursor=${all.nextCursor}`)
      ).json();
      const firstIds = new Set(all.items.map((item: { id: string }) => item.id));
      const overlap = second.items.filter((item: { id: string }) => firstIds.has(item.id));
      expect(overlap, 'страницы не должны пересекаться').toHaveLength(0);
    }
  });

  /** Критерий приёмки 11. */
  test('результат и комментарий переживают перезагрузку', async ({ page }) => {
    const list = await (await page.request.get('/api/calls?preset=30d&limit=1')).json();
    test.skip(list.items.length === 0, 'в базе нет звонков');

    const callId = list.items[0].id as string;
    const comment = `Автотест ${Date.now()}`;

    const patch = await page.request.patch(`/api/calls/${callId}`, {
      data: { outcome: 'INTERESTED', comment },
    });
    expect(patch.status()).toBe(200);

    await page.goto(`/calls/${callId}`);
    await expect(page.locator('#call-comment')).toHaveValue(comment);
    await expect(page.locator('#call-outcome')).toContainText('Заинтересован');
  });

  /** Критерий приёмки 12. */
  test('плеер записи воспроизводит файл', async ({ page }) => {
    const list = await (
      await page.request.get('/api/calls?preset=30d&limit=1&hasRecording=true')
    ).json();
    test.skip(list.items.length === 0, 'в базе нет звонков с записью');

    await page.goto(`/calls/${list.items[0].id}`);
    const audio = page.locator('audio');
    await expect(audio).toHaveCount(1);

    const played = await audio.evaluate(async (element: HTMLAudioElement) => {
      await element.play();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const advanced = element.currentTime > 0;
      element.pause();
      return advanced;
    });
    expect(played, 'запись должна реально проигрываться').toBe(true);
  });

  test('карточка звонка открывается по прямой ссылке', async ({ page }) => {
    const list = await (await page.request.get('/api/calls?preset=30d&limit=1')).json();
    test.skip(list.items.length === 0, 'в базе нет звонков');

    await page.goto(`/calls/${list.items[0].id}`);
    await expect(page.getByRole('heading', { name: 'Таймлайн' })).toBeVisible();
    await expect(page.getByText('Транскрипция будет доступна после подключения телефонии')).toBeVisible();
  });
});
