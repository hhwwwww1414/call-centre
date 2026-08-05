import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { callScopeFilter, canSeeAllCalls, isAdmin, type SessionUser } from '@/lib/auth/scope';

function user(role: Role, id = 'user-1'): SessionUser {
  return {
    id,
    email: 'test@vin2win.online',
    name: 'Тест',
    phone: null,
    role,
    mustChangePassword: false,
    theme: 'system',
    timezone: 'Europe/Moscow',
    extension: null,
    soundNotifications: false,
  };
}

describe('canSeeAllCalls', () => {
  it('чужие звонки видят только админ и супервайзер', () => {
    expect(canSeeAllCalls(Role.ADMIN)).toBe(true);
    expect(canSeeAllCalls(Role.SUPERVISOR)).toBe(true);
    expect(canSeeAllCalls(Role.MANAGER)).toBe(false);
  });
});

describe('isAdmin', () => {
  it('супервайзер — не администратор', () => {
    expect(isAdmin(Role.ADMIN)).toBe(true);
    expect(isAdmin(Role.SUPERVISOR)).toBe(false);
    expect(isAdmin(Role.MANAGER)).toBe(false);
  });
});

describe('callScopeFilter — изоляция данных', () => {
  it('менеджеру всегда подставляется его собственный userId', () => {
    expect(callScopeFilter(user(Role.MANAGER, 'me'))).toEqual({ userId: 'me' });
  });

  it('подставленный чужой userId менеджера игнорируется', () => {
    // Главная проверка ТЗ 3.2: фильтр не должен доверять данным клиента
    expect(callScopeFilter(user(Role.MANAGER, 'me'), 'someone-else')).toEqual({ userId: 'me' });
    expect(callScopeFilter(user(Role.MANAGER, 'me'), 'unassigned')).toEqual({ userId: 'me' });
  });

  it('админ без фильтра видит всё', () => {
    expect(callScopeFilter(user(Role.ADMIN))).toEqual({});
  });

  it('админ может выбрать конкретного менеджера', () => {
    expect(callScopeFilter(user(Role.ADMIN), 'manager-7')).toEqual({ userId: 'manager-7' });
  });

  it('админ может отобрать нераспределённые звонки', () => {
    expect(callScopeFilter(user(Role.ADMIN), 'unassigned')).toEqual({ userId: null });
  });
});
