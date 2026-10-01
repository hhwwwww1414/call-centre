/**
 * Фоновые задачи сервера: запускаются один раз при старте Node-рантайма.
 * Условие должно оборачивать импорт: так сборщик выкидывает серверные модули
 * (pg, S3) из edge-сборки, где нет fs и сети.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
