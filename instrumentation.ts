/** Фоновые задачи сервера: запускаются один раз при старте Node-рантайма. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startRecordingSweeper } = await import('@/lib/services/recordings');
  startRecordingSweeper();
}
