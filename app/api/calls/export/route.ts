import { NextResponse } from 'next/server';

import { handleRoute } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { ru } from '@/lib/i18n/ru';
import { formatPhone } from '@/lib/phone';
import { buildCallWhere, CALL_LIST_SELECT } from '@/lib/services/calls';
import { formatInZone } from '@/lib/time';
import { formatDuration } from '@/lib/utils';
import { callFiltersSchema, parseQuery } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Потолок выгрузки: миллион строк в XLSX не откроется ни у кого. */
const MAX_ROWS = 20_000;

const HEADERS = [
  'Дата и время',
  'Направление',
  'Статус',
  'Номер',
  'Контакт',
  'Компания',
  'Менеджер',
  'Ожидание, с',
  'Длительность',
  'Длительность, с',
  'Результат',
  'Запись',
  'Комментарий',
  'Теги',
];

export async function GET(request: Request) {
  return handleRoute(async () => {
    // Экспорт — только админ (ТЗ 5.4)
    const user = await requireAdmin();
    const filters = callFiltersSchema.parse({
      ...parseQuery(callFiltersSchema.partial(), request.url),
      limit: 50,
    });
    const format = new URL(request.url).searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';

    const where = buildCallWhere(user, filters);
    const calls = await prisma.call.findMany({
      where,
      select: CALL_LIST_SELECT,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS,
    });

    const rows = calls.map((call) => {
      const external = call.direction === 'INBOUND' ? call.fromNumber : call.toNumber;
      return [
        formatInZone(call.startedAt, user.timezone, 'datetime'),
        ru.callDirection[call.direction],
        ru.callStatus[call.status],
        formatPhone(external),
        call.contact?.name ?? '',
        call.contact?.company ?? '',
        call.user?.name ?? ru.calls.unassigned,
        call.waitSeconds ?? '',
        formatDuration(call.durationSeconds),
        call.durationSeconds,
        ru.callOutcome[call.outcome],
        call.recordingReady ? 'да' : 'нет',
        call.comment ?? '',
        call.tags.join(', '),
      ];
    });

    await writeAudit({
      actorId: user.id,
      action: 'call.export',
      entityType: 'Call',
      meta: { format, rows: rows.length, filters: { ...filters, cursor: undefined } },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `vin2win-calls-${stamp}.${format}`;

    if (format === 'xlsx') {
      const buffer = await buildXlsx(rows);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return new NextResponse(buildCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  });
}

function buildCsv(rows: (string | number)[][]): string {
  const escape = (value: string | number) => {
    const text = String(value ?? '');
    // Гасим формулы: Excel исполняет ячейку, начинающуюся с = + - @
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const lines = [HEADERS, ...rows].map((row) => row.map(escape).join(';'));
  // BOM — иначе Excel открывает кириллицу кракозябрами
  return `﻿${lines.join('\r\n')}`;
}

async function buildXlsx(rows: (string | number)[][]): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VIN2WIN CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Звонки', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);

  sheet.columns.forEach((column, index) => {
    const header = HEADERS[index] ?? '';
    column.width = Math.min(46, Math.max(12, header.length + 4));
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
