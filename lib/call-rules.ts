import type { CallOutcome } from '@prisma/client';

/**
 * Пороги против «накрутки». Короче MIN_TALK_SECONDS — это не разговор, а
 * «алло, сброс» или приветствие автоответчика. Попытка, сброшенная раньше
 * MIN_RING_SECONDS, — не попытка дозвониться: клиент не успел бы и достать телефон.
 * Файл без серверных зависимостей: правила нужны и окну итога.
 */
export const MIN_TALK_SECONDS = 10;
export const MIN_RING_SECONDS = 15;

/** Соединение было, разговора — нет: успешным такой звонок быть не может. */
export const NO_CONVERSATION_OUTCOMES: readonly CallOutcome[] = ['VOICEMAIL', 'HUNG_UP'];

export function isNoConversation(outcome: CallOutcome | null | undefined): boolean {
  return Boolean(outcome && NO_CONVERSATION_OUTCOMES.includes(outcome));
}
