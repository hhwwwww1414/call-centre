import { Role } from '@prisma/client';

/**
 * Чистые правила видимости данных — без Auth.js и без обращений к БД.
 * Вынесены отдельно, чтобы политику доступа можно было покрыть тестами,
 * не поднимая всю обвязку сессий.
 */

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  mustChangePassword: boolean;
  theme: string;
  timezone: string;
  extension: string | null;
  soundNotifications: boolean;
};

/** Админ и супервайзер видят чужие звонки, менеджер — только свои. */
export function canSeeAllCalls(role: Role): boolean {
  return role === Role.ADMIN || role === Role.SUPERVISOR;
}

export function isAdmin(role: Role): boolean {
  return role === Role.ADMIN;
}

/**
 * Фильтр изоляции данных. Возвращает часть where-условия Prisma:
 * менеджеру подмешивается жёсткий userId, а всё, что пришло с клиента,
 * игнорируется (ТЗ 3.2).
 */
export function callScopeFilter(user: SessionUser, requestedUserId?: string | null) {
  if (!canSeeAllCalls(user.role)) {
    return { userId: user.id };
  }
  if (requestedUserId === 'unassigned') return { userId: null };
  if (requestedUserId) return { userId: requestedUserId };
  return {};
}
