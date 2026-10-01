import type { Prisma } from '@prisma/client';
import { Client } from 'pg';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { toE164 } from '@/lib/phone';
import { buildListenerConfig } from '@/lib/realtime/pg-config';

/**
 * Синхронизация с площадкой vin2win. CRM читает витрину crm.accounts() базы
 * маркетплейса пользователем только на чтение (см. docs/marketplace) и хранит
 * снимок у себя: карточка клиента не зависит от доступности площадки, а
 * сегменты строятся обычными запросами.
 *
 * Ответственный менеджер живёт только в CRM. Новый пользователь площадки
 * получает контакт без ответственного — его раздаёт админ.
 */

const SYNC_INTERVAL_MS = 5 * 60_000;
const STATUS_KEY = 'marketplace.sync';

export const MARKETPLACE_PUBLIC_URL = (
  process.env.MARKETPLACE_PUBLIC_URL || 'https://vin2win.ru'
).replace(/\/+$/, '');

export function isMarketplaceConfigured(): boolean {
  return Boolean(process.env.MARKETPLACE_DATABASE_URL);
}

export function marketplaceProfileUrl(accountId: string): string {
  return `${MARKETPLACE_PUBLIC_URL}/users/${encodeURIComponent(accountId)}`;
}

export function marketplaceAdminUrl(accountId: string): string {
  return `${MARKETPLACE_PUBLIC_URL}/admin/users/${encodeURIComponent(accountId)}`;
}

/** Строка витрины crm.accounts(). */
export type MarketplaceRow = {
  user_id: string;
  public_id: number;
  user_name: string | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
  registered_at: Date;
  account_status: string;
  seller_activated_at: Date | null;
  first_useful_action_at: Date | null;
  last_seen_at: Date | null;
  profile_id: string | null;
  profile_type: string | null;
  profile_name: string | null;
  profile_full_name: string | null;
  legal_name: string | null;
  city: string | null;
  region: string | null;
  verification_status: string | null;
  moderation_status: string | null;
  moderation_note: string | null;
  trust_score: number | null;
  profile_completeness: number | null;
  verified_at: Date | null;
  listings_active: number;
  listings_draft: number;
  listings_pending: number;
  listings_rejected: number;
  listings_archived: number;
  listings_sold: number;
  last_listing_at: Date | null;
  views_30d: number;
  views_total: number;
  leads_total: number;
  threads_total: number;
  deals_total: number;
  reviews_count: number;
  reviews_avg: string | null;
  links: unknown;
  extra_phones: string[] | null;
  attribution_source: string | null;
  attribution_campaign: string | null;
  updated_at: Date | null;
};

export type SyncStatus = {
  at: string;
  ok: boolean;
  accounts?: number;
  createdContacts?: number;
  linkedContacts?: number;
  removed?: number;
  error?: string;
};

/** Имя человека для контакта: ФИО из профиля, затем имя аккаунта. */
export function displayName(row: MarketplaceRow): string | null {
  return (row.profile_full_name || row.user_name || row.profile_name)?.trim() || null;
}

/** Компания — только у дилера: у частника название профиля обычно и есть имя. */
export function companyName(row: MarketplaceRow): string | null {
  if (row.profile_type !== 'DEALER') return null;
  return (row.legal_name || row.profile_name)?.trim() || null;
}

/** Все телефоны аккаунта в E.164: основной первым, затем контактные лица. */
export function accountPhones(row: MarketplaceRow): string[] {
  const phones = [row.phone, ...(row.extra_phones ?? [])]
    .map((phone) => (phone ? toE164(phone) : ''))
    .filter(Boolean);
  return [...new Set(phones)];
}

async function fetchAccounts(): Promise<MarketplaceRow[]> {
  const config = buildListenerConfig(process.env.MARKETPLACE_DATABASE_URL!);
  const client = new Client({
    ...config,
    // Сертификат базы CRM (PGSSLROOTCERT) к базе площадки не подходит
    ssl: config.ssl === false ? false : { rejectUnauthorized: false },
    application_name: 'vin2win-crm-sync',
    statement_timeout: 60_000,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    const result = await client.query<MarketplaceRow>('select * from crm.accounts()');
    return result.rows;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function accountData(row: MarketplaceRow, phone: string | null, syncedAt: Date) {
  return {
    publicId: row.public_id,
    phoneE164: phone,
    name: displayName(row),
    email: row.email,
    phoneVerified: row.phone_verified,
    registeredAt: row.registered_at,
    accountStatus: row.account_status,
    sellerActivatedAt: row.seller_activated_at,
    lastSeenAt: row.last_seen_at,
    profileType: row.profile_type,
    profileName: row.profile_name,
    legalName: row.legal_name,
    city: row.city,
    region: row.region,
    verificationStatus: row.verification_status,
    moderationNote: row.moderation_note,
    trustScore: row.trust_score,
    profileCompleteness: row.profile_completeness,
    listingsActive: row.listings_active,
    listingsDraft: row.listings_draft,
    listingsPending: row.listings_pending,
    listingsRejected: row.listings_rejected,
    listingsArchived: row.listings_archived,
    listingsSold: row.listings_sold,
    lastListingAt: row.last_listing_at,
    views30d: row.views_30d,
    viewsTotal: row.views_total,
    leadsTotal: row.leads_total,
    threadsTotal: row.threads_total,
    dealsTotal: row.deals_total,
    reviewsCount: row.reviews_count,
    reviewsAvg: row.reviews_avg == null ? null : Number(row.reviews_avg),
    links: (Array.isArray(row.links) ? row.links : []) as Prisma.InputJsonValue,
    extraPhones: (row.extra_phones ?? []).map((p) => toE164(p) || p),
    source: row.attribution_source,
    campaign: row.attribution_campaign,
    marketplaceUpdatedAt: row.updated_at,
    removedAt: null,
    syncedAt,
  };
}

/**
 * Привязка аккаунта к контакту. Уже привязанный не трогаем; иначе ищем
 * свободный контакт по любому из телефонов, а если нет — создаём без
 * ответственного. Имя и компанию дописываем, только если они пустые: правки
 * менеджеров важнее данных площадки.
 */
async function resolveContact(
  row: MarketplaceRow,
  phones: string[],
  current: { contactId: string | null } | null,
): Promise<{ contactId: string | null; created: boolean; linked: boolean }> {
  if (current?.contactId) return { contactId: current.contactId, created: false, linked: false };
  if (phones.length === 0) return { contactId: null, created: false, linked: false };

  const candidates = await prisma.contact.findMany({
    where: { phoneE164: { in: phones }, marketplace: null },
    select: { id: true, phoneE164: true, name: true, company: true },
  });
  const match = phones.map((phone) => candidates.find((c) => c.phoneE164 === phone)).find(Boolean);

  if (match) {
    const fill: Prisma.ContactUpdateInput = {};
    if (!match.name && displayName(row)) fill.name = displayName(row);
    if (!match.company && companyName(row)) fill.company = companyName(row);
    if (Object.keys(fill).length)
      await prisma.contact.update({ where: { id: match.id }, data: fill });
    return { contactId: match.id, created: false, linked: true };
  }

  // Номер мог уже принадлежать контакту, привязанному к другому аккаунту
  const primary = phones[0]!;
  const taken = await prisma.contact.findUnique({
    where: { phoneE164: primary },
    select: { id: true },
  });
  if (taken) return { contactId: null, created: false, linked: false };

  const contact = await prisma.contact.create({
    data: { phoneE164: primary, name: displayName(row), company: companyName(row) },
    select: { id: true },
  });
  return { contactId: contact.id, created: true, linked: true };
}

let running: Promise<SyncStatus> | null = null;

/** Полная сверка: аккаунтов немного, так что тянем всё за один запрос. */
export function syncMarketplace(): Promise<SyncStatus> {
  if (!running) {
    running = runSync().finally(() => {
      running = null;
    });
  }
  return running;
}

async function runSync(): Promise<SyncStatus> {
  const startedAt = new Date();
  let status: SyncStatus;
  try {
    const rows = await fetchAccounts();
    const existing = new Map(
      (await prisma.marketplaceAccount.findMany({ select: { id: true, contactId: true } })).map(
        (a) => [a.id, a],
      ),
    );

    let createdContacts = 0;
    let linkedContacts = 0;
    for (const row of rows) {
      const phones = accountPhones(row);
      const current = existing.get(row.user_id) ?? null;
      const link = await resolveContact(row, phones, current);
      if (link.created) createdContacts += 1;
      if (link.linked) linkedContacts += 1;
      const data = accountData(row, phones[0] ?? null, startedAt);
      await prisma.marketplaceAccount.upsert({
        where: { id: row.user_id },
        create: { id: row.user_id, ...data, contactId: link.contactId },
        update: { ...data, ...(link.linked ? { contactId: link.contactId } : {}) },
      });
    }

    // Кого нет в витрине — удалён или стал служебным: помечаем, не удаляем
    const removed = await prisma.marketplaceAccount.updateMany({
      where: { id: { notIn: rows.map((row) => row.user_id) }, removedAt: null },
      data: { removedAt: startedAt },
    });

    status = {
      at: startedAt.toISOString(),
      ok: true,
      accounts: rows.length,
      createdContacts,
      linkedContacts,
      removed: removed.count,
    };
    logger.info(status, 'синхронизация с vin2win завершена');
  } catch (err) {
    status = {
      at: startedAt.toISOString(),
      ok: false,
      error: err instanceof Error ? err.message : 'неизвестная ошибка',
    };
    logger.warn({ err }, 'синхронизация с vin2win не удалась');
  }

  await prisma.setting.upsert({
    where: { key: STATUS_KEY },
    create: { key: STATUS_KEY, value: status },
    update: { value: status },
  });
  return status;
}

export async function getSyncStatus(): Promise<SyncStatus | null> {
  const row = await prisma.setting.findUnique({ where: { key: STATUS_KEY } });
  return (row?.value as SyncStatus | undefined) ?? null;
}

let timer: NodeJS.Timeout | null = null;

export function startMarketplaceSync(): void {
  if (timer || !isMarketplaceConfigured()) return;
  const run = () => void syncMarketplace();
  timer = setInterval(run, SYNC_INTERVAL_MS);
  timer.unref();
  setTimeout(run, 20_000).unref();
  logger.info('синхронизация с vin2win включена');
}

/** Сегменты базы vin2win для обзвона. */
export const MARKETPLACE_SEGMENTS = [
  'marketplace',
  'no_listings',
  'rejected',
  'drafts',
  'dormant',
  'dealers',
] as const;
export type MarketplaceSegment = (typeof MARKETPLACE_SEGMENTS)[number];

const DORMANT_DAYS = 14;

export function marketplaceSegmentWhere(segment: MarketplaceSegment): Prisma.ContactWhereInput {
  const base: Prisma.MarketplaceAccountWhereInput = { removedAt: null };
  switch (segment) {
    case 'marketplace':
      return { marketplace: base };
    case 'no_listings':
      return {
        marketplace: {
          ...base,
          listingsActive: 0,
          listingsDraft: 0,
          listingsPending: 0,
          listingsArchived: 0,
          listingsSold: 0,
        },
      };
    case 'rejected':
      return { marketplace: { ...base, verificationStatus: 'REJECTED' } };
    case 'drafts':
      return { marketplace: { ...base, listingsDraft: { gt: 0 } } };
    case 'dormant': {
      const since = new Date(Date.now() - DORMANT_DAYS * 86_400_000);
      return {
        marketplace: { ...base, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: since } }] },
      };
    }
    case 'dealers':
      return { marketplace: { ...base, profileType: 'DEALER' } };
  }
}
