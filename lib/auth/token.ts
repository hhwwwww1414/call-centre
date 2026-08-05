import type { Role } from '@prisma/client';
import type { JWT } from 'next-auth/jwt';

/**
 * Полезная нагрузка нашего JWT.
 *
 * Не используем declaration merging для `@auth/core/jwt`: под pnpm пакет
 * лежит во вложенном node_modules, аугментация до него не доезжает и все поля
 * молча становятся `unknown`. Явный тип надёжнее и читается лучше.
 */
export type AppToken = JWT & {
  sub?: string;
  role?: Role;
  name?: string | null;
  email?: string | null;
  mustChangePassword?: boolean;
  theme?: string;
  timezone?: string;
  extension?: string | null;
  soundNotifications?: boolean;
  refreshedAt?: number;
};

export function asAppToken(token: JWT): AppToken {
  return token as AppToken;
}
