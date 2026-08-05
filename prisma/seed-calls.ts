/**
 * Демо-история звонков, чтобы дашборд и аналитика не были пустыми (ТЗ 7.2).
 *
 *   pnpm seed:calls -- --days=30
 *   pnpm seed:calls -- --days=7 --per-day=40 --reset
 *
 * В проде не запускать: скрипт создаёт синтетические записи.
 */
import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  callsForDate,
  chance,
  generateCall,
  MOCK_RECORDING_URL,
  pick,
  randomCompany,
  randomPersonName,
  randomPhoneE164,
} from '../lib/telephony/mock-data';

const prisma = new PrismaClient();

function arg(name: string, fallback: number): number {
  const raw = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const parsed = Number(raw.split('=')[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DAYS = arg('days', 30);
const PER_DAY = arg('per-day', 55);
const CONTACTS = arg('contacts', 140);
const RESET = process.argv.includes('--reset');
const OUR_NUMBER = process.env.EXOLVE_NUMBER || '+74951234567';

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Демо-звонки в проде не создаём. Если это осознанно — добавьте --force');
  }

  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { in: [Role.MANAGER, Role.ADMIN] },
    },
    select: { id: true, name: true, extension: true },
  });

  if (managers.length === 0) {
    throw new Error('Нет активных пользователей. Сначала выполните pnpm db:seed');
  }

  if (RESET) {
    const { count } = await prisma.call.deleteMany({
      where: { provider: 'mock' },
    });
    console.log(`Удалено демо-звонков: ${count}`);
  }

  // 1. Контакты
  console.log(`Готовим ${CONTACTS} контактов…`);
  const phones = new Set<string>();
  while (phones.size < CONTACTS) phones.add(randomPhoneE164());

  await prisma.contact.createMany({
    data: Array.from(phones).map((phoneE164) => ({
      phoneE164,
      name: chance(0.65) ? randomPersonName() : null,
      company: chance(0.3) ? randomCompany() : null,
      isBlocked: chance(0.03),
    })),
    skipDuplicates: true,
  });

  const contacts = await prisma.contact.findMany({
    where: { phoneE164: { in: Array.from(phones) } },
    select: { id: true, phoneE164: true },
  });

  // 2. Звонки по дням
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let created = 0;

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(today.getTime() - dayOffset * 86_400_000);
    const count = callsForDate(day, PER_DAY);
    if (count === 0) continue;

    const rows = Array.from({ length: count }, () => generateCall(day))
      // За сегодняшний день генератор может выдать вечерние часы, которые
      // ещё не наступили: звонок «из будущего» ломает и сортировку, и графики
      .filter((generated) => generated.endedAt.getTime() <= Date.now())
      .map((generated) => {
        const contact = pick(contacts);
        const manager = pick(managers);
        const inbound = generated.direction === 'INBOUND';

        return {
          externalId: `mock-seed-${randomUUID()}`,
          provider: 'mock',
          direction: generated.direction,
          status: generated.status,
          outcome: generated.outcome,
          fromNumber: inbound ? contact.phoneE164 : OUR_NUMBER,
          toNumber: inbound ? OUR_NUMBER : contact.phoneE164,
          contactId: contact.id,
          // Часть входящих остаётся нераспределённой — это реальный случай
          userId: inbound && chance(0.04) ? null : manager.id,
          startedAt: generated.startedAt,
          answeredAt: generated.answeredAt,
          endedAt: generated.endedAt,
          waitSeconds: generated.waitSeconds,
          durationSeconds: generated.durationSeconds,
          billSeconds: generated.durationSeconds > 0 ? generated.durationSeconds + 2 : 0,
          recordingUrl: generated.hasRecording ? MOCK_RECORDING_URL : null,
          recordingReady: generated.hasRecording,
          comment: generated.comment,
          tags: generated.tags,
        };
      });

    if (rows.length === 0) continue;

    // createMany не дёргает триггер построчно на каждый апдейт UI —
    // для истории это то, что нужно: не спамим realtime тысячами событий
    const result = await prisma.call.createMany({
      data: rows,
      skipDuplicates: true,
    });
    created += result.count;
    process.stdout.write(`\r  ${day.toISOString().slice(0, 10)} — всего ${created} звонков`);
  }

  process.stdout.write('\n');
  console.log(`Готово. Создано звонков: ${created}, менеджеров задействовано: ${managers.length}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
