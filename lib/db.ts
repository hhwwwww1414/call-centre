import { PrismaClient } from '@prisma/client';

/**
 * Один экземпляр клиента на процесс. В dev Next перезагружает модули при HMR,
 * поэтому храним клиент в globalThis — иначе пул соединений растёт до отказа БД.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }]
        : [{ emit: 'stdout', level: 'error' }],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
