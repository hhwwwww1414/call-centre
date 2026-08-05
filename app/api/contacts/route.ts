import type { Prisma } from '@prisma/client';

import { handleRoute } from '@/lib/api';
import { canSeeAllCalls, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { digitsOnly } from '@/lib/phone';
import { contactFiltersSchema, parseQuery } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const filters = parseQuery(contactFiltersSchema, request.url);

    // Менеджер видит только те контакты, с которыми сам разговаривал
    const scope: Prisma.ContactWhereInput = canSeeAllCalls(user.role)
      ? { calls: { some: {} } }
      : { calls: { some: { userId: user.id } } };

    const where: Prisma.ContactWhereInput = { ...scope };
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
        _count: { select: { calls: true } },
        calls: {
          where: canSeeAllCalls(user.role) ? {} : { userId: user.id },
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
