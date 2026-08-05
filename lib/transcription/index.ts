import type { TranscriptionProvider, TranscriptResult } from '@/lib/telephony/types';

/**
 * Задел под транскрибацию (ТЗ 7.4). Интерфейс объявлен и подключён к UI,
 * реализации нет — карточка звонка честно показывает «недоступно».
 *
 * Что понадобится при подключении, описано в docs/EXOLVE_INTEGRATION.md:
 * очередь фоновых задач (предпочтительно pg-boss на существующем Postgres,
 * чтобы не тянуть Redis) и провайдер распознавания речи.
 */
export class NoopTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'noop';

  async transcribe(): Promise<TranscriptResult> {
    return { status: 'FAILED', language: 'ru' };
  }
}

export function getTranscriptionProvider(): TranscriptionProvider {
  return new NoopTranscriptionProvider();
}

export function isTranscriptionEnabled(): boolean {
  return false;
}
