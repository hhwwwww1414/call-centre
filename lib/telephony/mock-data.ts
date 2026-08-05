import { CallDirection, CallOutcome, CallStatus } from '@prisma/client';

/**
 * Генераторы правдоподобных данных для демо-режима.
 * Чистые функции без обращений к БД — их же использует seed:calls и тесты.
 */

/** Мобильные коды, реально выданные российским операторам. */
const MOBILE_PREFIXES = [
  '901', '903', '904', '905', '906', '908', '909',
  '910', '912', '915', '916', '917', '919',
  '920', '921', '922', '925', '926', '927', '929',
  '930', '931', '936', '937', '939',
  '950', '951', '952', '953', '958',
  '960', '961', '962', '963', '964', '965', '967', '968',
  '977', '978', '980', '981', '982', '983', '984', '985', '986', '987', '988', '989',
  '991', '992', '995', '996', '999',
];

const FIRST_NAMES_M = [
  'Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Алексей', 'Артём',
  'Илья', 'Кирилл', 'Михаил', 'Никита', 'Роман', 'Егор', 'Иван', 'Пётр',
];
const FIRST_NAMES_F = [
  'Анна', 'Мария', 'Елена', 'Ольга', 'Наталья', 'Ирина', 'Татьяна',
  'Екатерина', 'Юлия', 'Светлана', 'Дарья', 'Ксения', 'Полина',
];
const LAST_NAMES_M = [
  'Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов',
  'Михайлов', 'Новиков', 'Фёдоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев',
];

const COMPANIES = [
  'АвтоТрейд', 'Лидер Авто', 'Гранд Моторс', 'СитиКар', 'АвтоДом',
  'Драйв Плюс', 'Первый Автоцентр', 'МоторЛайн', 'ТрансАвто', 'КарСервис',
  null, null, null, null, null, null, // у большинства контактов компании нет
];

/** Плотность звонков по часам: пик 11:00–13:00 и 15:00–18:00 (ТЗ 7.2). */
const HOUR_WEIGHTS = [
  0, 0, 0, 0, 0, 0, // 00–05
  0.2, 0.6, 1.5, 3.5, 5, // 06–10
  8, 9, 8.5, // 11–13 первый пик
  4, // 14 — обед
  7.5, 8.5, 8, 6.5, // 15–18 второй пик
  3.5, 2, 1, 0.4, 0.1, // 19–23
];

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick<T>(items: readonly T[]): T {
  const value = items[Math.floor(Math.random() * items.length)];
  if (value === undefined) throw new Error('pick() из пустого массива');
  return value;
}

export function chance(probability: number): boolean {
  return Math.random() < probability;
}

export function randomPhoneE164(): string {
  const prefix = pick(MOBILE_PREFIXES);
  const rest = String(randomInt(1000000, 9999999)).padStart(7, '0');
  return `+7${prefix}${rest}`;
}

export function randomPersonName(): string {
  if (chance(0.42)) {
    return `${pick(FIRST_NAMES_F)} ${pick(LAST_NAMES_M)}а`;
  }
  return `${pick(FIRST_NAMES_M)} ${pick(LAST_NAMES_M)}`;
}

export function randomCompany(): string | null {
  return pick(COMPANIES);
}

/** Box–Muller: стандартная нормальная величина. */
function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Логнормальная длительность разговора со средним ~150 с (ТЗ 7.2):
 * много коротких, изредка длинные — как в жизни.
 */
export function randomTalkDuration(): number {
  const mu = 4.69;
  const sigma = 0.8;
  const value = Math.exp(mu + sigma * gaussian());
  return Math.min(3600, Math.max(5, Math.round(value)));
}

/** Час суток по распределению нагрузки. */
export function randomBusinessHour(): number {
  const total = HOUR_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let hour = 0; hour < HOUR_WEIGHTS.length; hour += 1) {
    roll -= HOUR_WEIGHTS[hour] ?? 0;
    if (roll <= 0) return hour;
  }
  return 12;
}

/** Сколько звонков приходится на конкретную дату: в выходные заметно меньше. */
export function callsForDate(date: Date, baseline: number): number {
  const weekday = date.getDay();
  const factor = weekday === 0 ? 0.15 : weekday === 6 ? 0.35 : 1;
  const jitter = 0.7 + Math.random() * 0.6;
  return Math.max(0, Math.round(baseline * factor * jitter));
}

export type GeneratedCall = {
  direction: CallDirection;
  status: CallStatus;
  outcome: CallOutcome;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date;
  waitSeconds: number;
  durationSeconds: number;
  hasRecording: boolean;
  comment: string | null;
  tags: string[];
};

const COMMENTS = [
  'Интересует Camry 2019, перезвонить после 18:00',
  'Просил прислать подборку на почту',
  'Спрашивал про trade-in, оставил заявку',
  'Уточнял по кредиту, ждёт расчёт',
  'Не тот номер, попал случайно',
  'Просил не беспокоить',
  'Готов приехать на осмотр в субботу',
  'Нужен отчёт по VIN перед сделкой',
];

const TAG_POOL = ['горячий', 'trade-in', 'кредит', 'подбор', 'повторный', 'из рекламы'];

/**
 * Один правдоподобный завершённый звонок в заданный день.
 * Доля пропущенных ~15% (ТЗ 7.2).
 */
export function generateCall(day: Date): GeneratedCall {
  const startedAt = new Date(day);
  startedAt.setHours(randomBusinessHour(), randomInt(0, 59), randomInt(0, 59), 0);

  const direction = chance(0.62) ? CallDirection.INBOUND : CallDirection.OUTBOUND;
  const missed = chance(0.15);
  const waitSeconds = missed ? randomInt(15, 45) : randomInt(2, 18);

  if (missed) {
    const endedAt = new Date(startedAt.getTime() + waitSeconds * 1000);
    return {
      direction,
      status: direction === CallDirection.INBOUND ? CallStatus.MISSED : CallStatus.NO_ANSWER,
      // Пропущенный входящий сразу попадает в очередь «нужно перезвонить»
      outcome:
        direction === CallDirection.INBOUND && chance(0.55) ? CallOutcome.CALLBACK : CallOutcome.NEW,
      startedAt,
      answeredAt: null,
      endedAt,
      waitSeconds,
      durationSeconds: 0,
      hasRecording: false,
      comment: null,
      tags: [],
    };
  }

  const durationSeconds = randomTalkDuration();
  const answeredAt = new Date(startedAt.getTime() + waitSeconds * 1000);
  const endedAt = new Date(answeredAt.getTime() + durationSeconds * 1000);

  return {
    direction,
    status: CallStatus.COMPLETED,
    outcome: randomOutcome(durationSeconds),
    startedAt,
    answeredAt,
    endedAt,
    waitSeconds,
    durationSeconds,
    hasRecording: chance(0.85),
    comment: chance(0.28) ? pick(COMMENTS) : null,
    tags: chance(0.22) ? [pick(TAG_POOL)] : [],
  };
}

/** Чем дольше разговор, тем выше шанс осмысленного результата. */
function randomOutcome(durationSeconds: number): CallOutcome {
  if (durationSeconds < 20) {
    return chance(0.5) ? CallOutcome.WRONG_NUMBER : CallOutcome.SPAM;
  }
  const roll = Math.random();
  if (durationSeconds > 240) {
    if (roll < 0.18) return CallOutcome.DEAL;
    if (roll < 0.55) return CallOutcome.INTERESTED;
    if (roll < 0.75) return CallOutcome.CALLBACK;
    if (roll < 0.9) return CallOutcome.REFUSED;
    return CallOutcome.NEW;
  }
  if (roll < 0.05) return CallOutcome.DEAL;
  if (roll < 0.3) return CallOutcome.INTERESTED;
  if (roll < 0.5) return CallOutcome.CALLBACK;
  if (roll < 0.72) return CallOutcome.REFUSED;
  if (roll < 0.8) return CallOutcome.WRONG_NUMBER;
  return CallOutcome.NEW;
}

/** Тестовый аудиофайл, чтобы плеер в карточке звонка был рабочим (ТЗ 7.2). */
export const MOCK_RECORDING_URL = '/audio/demo-call.wav';
