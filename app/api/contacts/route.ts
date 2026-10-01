import type { Prisma } from '@prisma/client';

import { conflict, handleRoute } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { canSeeAllCalls, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { digitsOnly } from '@/lib/phone';
import { contactCreateSchema, contactFiltersSchema, parseQuery } from '@/lib/validation';
import { CONTACT_SELECT } from '@/lib/services/contacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const filters = parseQuery(contactFiltersSchema, request.url);

    // База общая: все, с кем был звонок или у кого есть ответственный
    const scope: Prisma.ContactWhereInput = {
      OR: [{ calls: { some: {} } }, { ownerId: { not: null } }],
    };

    const where: Prisma.ContactWhereInput = { AND: [scope] };
    if (filters.owner === 'me') where.ownerId = user.id;
    else if (filters.owner === 'none') where.ownerId = null;
    else if (filters.owner && canSeeAllCalls(user.role)) where.ownerId = filters.owner;
    if (filters.onlyBlocked) where.isBlocked = true;

    const search = filters.search?.trim();
    if (search) {
      const digits = digitsOnly(search);
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { phoneE164: { contains: digits.length >= 3 ? digits.slice(-10) : search } },
      ];
    }

    const items = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        phoneE164: true,
        name: true,
        company: true,
        note: true,
        isBlocked: true,
        owner: { select: { id: true, name: true } },
        _count: { select: { calls: true } },
        // Последний звонок по клиенту от любого менеджера — чтобы не звонить вдвоём
        calls: {
          select: { startedAt: true, direction: true, status: true },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > filters.limit;
    const page = hasMore ? items.slice(0, filters.limit) : items;

    return {
      items: page.map((contact) => {
        const { calls, _count, ...rest } = contact;
        return {
          ...rest,
          callsCount: _count.calls,
          lastCall: calls[0] ?? null,
        };
      }),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  });
}

/** Контакт вручную — например, из базы для холодного обзвона. Ответственный — автор. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const input = contactCreateSchema.parse(await request.json());

    const existing = await prisma.contact.findUnique({
      where: { phoneE164: input.phone },
      select: { id: true },
    });
    if (existing) {
      throw conflict('Контакт с этим номером уже есть', {
        phone: 'Контакт с этим номером уже есть',
        contactId: existing.id,
      });
    }

    const contact = await prisma.contact.create({
      data: {
        phoneE164: input.phone,
        name: input.name || null,
        company: input.company || null,
        note: input.note || null,
        ownerId: user.id,
      },
      select: CONTACT_SELECT,
    });

    await writeAudit({
      actorId: user.id,
      action: 'contact.create',
      entityType: 'Contact',
      entityId: contact.id,
      meta: { phone: contact.phoneE164, name: contact.name },
    });

    return contact;
  });
}
