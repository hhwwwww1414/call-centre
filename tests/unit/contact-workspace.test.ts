import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/scope';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  contact: vi.fn(),
  calls: vi.fn(),
  auditCursor: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    contact: { findFirst: mocks.contact },
    call: { findMany: mocks.calls },
    auditLog: { findFirst: mocks.auditCursor, findMany: mocks.audit },
  },
}));
vi.mock('@/lib/auth/rbac', async () => ({
  ...(await import('@/lib/auth/scope')),
  requireUser: mocks.requireUser,
  AuthError: class extends Error {
    status = 403;
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '@/app/api/contacts/[id]/audit/route';
import {
  contactAccessWhere,
  contactCallsWhere,
  contactHistorySchema,
} from '@/lib/services/contacts';

const manager = { id: 'manager-a', role: 'MANAGER' } as SessionUser;

describe('client workspace access', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUser.mockResolvedValue(manager);
    mocks.contact.mockResolvedValue({ id: 'client' });
    mocks.calls.mockResolvedValue([{ id: 'visible-call' }]);
    mocks.audit.mockResolvedValue([]);
  });

  it('keeps personal scope for every history view, even for the contact owner', () => {
    for (const view of ['all', 'recordings', 'comments', 'tags']) {
      const filters = contactHistorySchema.parse({ view, tag: 'VIP', userId: 'other-manager' });
      expect(contactCallsWhere(manager, 'client', filters)).toMatchObject({
        contactId: 'client',
        userId: manager.id,
      });
    }
    expect(contactAccessWhere(manager, 'client')).toMatchObject({
      OR: [{ calls: { some: { userId: manager.id } } }, { ownerId: manager.id }],
    });
  });

  it.each(['ADMIN', 'SUPERVISOR'] as const)('lets %s review all client calls', (role) => {
    const user = { ...manager, role };
    expect(contactAccessWhere(user, 'client')).toEqual({ id: 'client' });
    expect(contactCallsWhere(user, 'client', { view: 'all' })).not.toHaveProperty('userId');
  });

  it('does not query audit when the contact is inaccessible', async () => {
    mocks.contact.mockResolvedValue(null);
    const result = await GET(new Request('http://localhost/api/contacts/client/audit'), {
      params: Promise.resolve({ id: 'client' }),
    });
    expect(result.status).toBe(404);
    expect(mocks.calls).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('scopes audit to the client and visible calls without exposing session metadata', async () => {
    await GET(new Request('http://localhost/api/contacts/client/audit'), {
      params: Promise.resolve({ id: 'client' }),
    });
    expect(mocks.calls).toHaveBeenCalledWith({
      where: { contactId: 'client', userId: manager.id },
      select: { id: true },
    });
    const query = mocks.audit.mock.calls[0]![0];
    expect(query.where.OR).toEqual([
      { entityType: 'Contact', entityId: 'client', action: { startsWith: 'contact.' } },
      { entityType: 'Call', entityId: { in: ['visible-call'] }, action: { startsWith: 'call.' } },
    ]);
    expect(query.select).not.toHaveProperty('ip');
    expect(query.select).not.toHaveProperty('userAgent');
    expect(query.select.actor.select).not.toHaveProperty('email');
  });

  it('rejects a cursor from an unrelated audit event', async () => {
    mocks.auditCursor.mockResolvedValue(null);
    const result = await GET(
      new Request('http://localhost/api/contacts/client/audit?cursor=other-event'),
      { params: Promise.resolve({ id: 'client' }) },
    );
    expect(result.status).toBe(404);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('paginates audit with a stable tie-breaker without returning the extra row', async () => {
    mocks.audit.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ id: `event-${i}` })));
    const result = await GET(new Request('http://localhost/api/contacts/client/audit'), {
      params: Promise.resolve({ id: 'client' }),
    });
    const body = await result.json();
    expect(body.items).toHaveLength(50);
    expect(body.nextCursor).toBe('event-49');
    expect(mocks.audit.mock.calls[0]![0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});
