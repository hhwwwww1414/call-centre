import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { notFound } from '@/lib/api';
import { callScopeFilter, type SessionUser } from '@/lib/auth/scope';
import { prisma } from '@/lib/db';

export const CONTACT_SELECT = {
  id: true,
  name: true,
  company: true,
  note: true,
  isBlocked: true,
  phoneE164: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, extension: true } },
  marketplace: {
    select: {
      id: true,
      publicId: true,
      name: true,
      email: true,
      phoneVerified: true,
      emailVerified: true,
      accessStatus: true,
      registeredAt: true,
      accountStatus: true,
      sellerActivatedAt: true,
      lastSeenAt: true,
      lastOnlineAt: true,
      profileType: true,
      profileName: true,
      legalName: true,
      city: true,
      region: true,
      verificationStatus: true,
      moderationNote: true,
      trustScore: true,
      profileCompleteness: true,
      listingsActive: true,
      listingsDraft: true,
      listingsPending: true,
      listingsRejected: true,
      listingsArchived: true,
      listingsSold: true,
      lastListingAt: true,
      views30d: true,
      leadsTotal: true,
      threadsTotal: true,
      dealsTotal: true,
      reviewsCount: true,
      reviewsAvg: true,
      links: true,
      source: true,
      removedAt: true,
      syncedAt: true,
    },
  },
} as const;

export const contactHistorySchema = z.object({
  view: z.enum(['all', 'recordings', 'comments', 'tags']).default('all'),
  tag: z.string().max(100).optional(),
  cursor: z.string().min(1).max(100).optional(),
});

/**
 * База клиентов общая: менеджер видит и дополняет любой контакт, чтобы не
 * звонить тому, с кем уже работает коллега. Звонки при этом видны по своим
 * правам — чужие разговоры менеджеру не открываются.
 */
export function contactAccessWhere(_user: SessionUser, id: string): Prisma.ContactWhereInput {
  return { id };
}

export async function assertContactAccess(user: SessionUser, id: string) {
  const contact = await prisma.contact.findFirst({
    where: contactAccessWhere(user, id),
    select: CONTACT_SELECT,
  });
  if (!contact) throw notFound('Контакт не найден или недоступен');
  return contact;
}

export function contactCallsWhere(
  user: SessionUser,
  contactId: string,
  filters: z.infer<typeof contactHistorySchema>,
): Prisma.CallWhereInput {
  return {
    contactId,
    ...callScopeFilter(user),
    ...(filters.view === 'recordings' ? { recordingReady: true, recordingUrl: { not: null } } : {}),
    ...(filters.view === 'comments'
      ? { OR: [{ comment: { not: null } }, { summary: { not: null } }] }
      : {}),
    ...(filters.view === 'tags'
      ? { tags: filters.tag ? { has: filters.tag } : { isEmpty: false } }
      : {}),
  };
}

/** Only this contact and calls visible to the requester; never global audit events. */
export function contactAuditWhere(contactId: string, callIds: string[]): Prisma.AuditLogWhereInput {
  return {
    OR: [
      { entityType: 'Contact', entityId: contactId, action: { startsWith: 'contact.' } },
      { entityType: 'Call', entityId: { in: callIds }, action: { startsWith: 'call.' } },
    ],
  };
}
