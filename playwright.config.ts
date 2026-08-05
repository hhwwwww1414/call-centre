import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * E2E по ключевым сценариям приёмки (ТЗ 10). Тесты идут против уже собранного
 * приложения и реальной БД: сценарии проверяют изоляцию данных и realtime,
 * а их на моках не проверишь.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Pixel 7, а не iPhone: он на Chromium, и для запуска не нужен
      // отдельно установленный WebKit — на CI это лишняя зависимость
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm start',
          url: `${BASE_URL}/api/health`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
