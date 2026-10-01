-- Витрина маркетплейса vin2win для CRM колл-центра.
--
-- Запускается под владельцем таблиц маркетплейса (gen_user). CRM подключается
-- пользователем crm_reader и видит только функцию crm.accounts(): ни таблиц,
-- ни хэшей паролей, ни переписки.
--
-- Функция, а не view: view держит жёсткую зависимость от колонок, и миграция
-- маркетплейса, которая переименует или удалит колонку, упала бы. Функция на
-- языке sql с телом-строкой зависимостей не создаёт — при изменении схемы
-- сломается только синхронизация CRM, а деплой площадки пройдёт как обычно.
--
-- Откат: crm-showcase-rollback.sql

BEGIN;

CREATE SCHEMA IF NOT EXISTS crm AUTHORIZATION gen_user;
COMMENT ON SCHEMA crm IS 'Витрина для CRM колл-центра (только чтение, пользователь crm_reader)';
REVOKE ALL ON SCHEMA crm FROM PUBLIC;

-- Набор колонок менялся: CREATE OR REPLACE не умеет менять тип результата
DROP FUNCTION IF EXISTS crm.accounts();

CREATE FUNCTION crm.accounts()
RETURNS TABLE (
  user_id text,
  public_id integer,
  user_name text,
  email text,
  phone text,
  phone_verified boolean,
  email_verified boolean,
  access_status text,
  registered_at timestamp,
  account_status text,
  seller_activated_at timestamp,
  first_useful_action_at timestamp,
  last_seen_at timestamp,
  profile_id text,
  profile_type text,
  profile_name text,
  profile_full_name text,
  legal_name text,
  city text,
  region text,
  verification_status text,
  moderation_status text,
  moderation_note text,
  trust_score integer,
  profile_completeness integer,
  verified_at timestamp,
  listings_active integer,
  listings_draft integer,
  listings_pending integer,
  listings_rejected integer,
  listings_archived integer,
  listings_sold integer,
  last_listing_at timestamp,
  views_30d integer,
  views_total integer,
  leads_total integer,
  threads_total integer,
  deals_total integer,
  reviews_count integer,
  reviews_avg numeric,
  links jsonb,
  extra_phones text[],
  attribution_source text,
  attribution_campaign text,
  updated_at timestamp
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT
    u.id,
    u."publicId",
    u.name,
    u.email,
    u.phone,
    u."phoneVerifiedAt" IS NOT NULL,
    u."emailVerifiedAt" IS NOT NULL,
    -- Те же правила, что в админке площадки (backend/src/admin/user-access-status.ts):
    -- профиль уходит на модерацию только после подтверждения почты
    CASE
      WHEN p.id IS NULL THEN 'no_profile'
      WHEN p."verificationStatus" = 'REJECTED' THEN 'rejected'
      WHEN p."verificationStatus" = 'MANUAL_REVIEW' THEN 'pending'
      WHEN p."verificationStatus" = 'PENDING' THEN
        CASE WHEN u."emailVerifiedAt" IS NOT NULL THEN 'pending' ELSE 'email_unconfirmed' END
      WHEN u."accountStatus" = 'ACTIVE' THEN 'approved'
      ELSE 'restricted'
    END,
    u."createdAt",
    u."accountStatus"::text,
    u."sellerActivatedAt",
    u."firstUsefulActionAt",
    s.last_seen_at,
    p.id,
    p.type::text,
    p.name,
    p."fullName",
    p."legalName",
    p.city,
    p."regionLabel",
    p."verificationStatus"::text,
    p."moderationStatusV2"::text,
    p."moderationNote",
    p."trustScore",
    p."profileCompleteness",
    p."verifiedAt",
    coalesce(l.active, 0),
    coalesce(l.draft, 0),
    coalesce(l.pending, 0),
    coalesce(l.rejected, 0),
    coalesce(l.archived, 0),
    coalesce(l.sold, 0),
    l.last_listing_at,
    coalesce(v.views_30d, 0),
    coalesce(v.views_total, 0),
    coalesce(ld.leads_total, 0),
    coalesce(th.threads_total, 0),
    coalesce(dl.deals_total, 0),
    coalesce(rv.reviews_count, 0),
    rv.reviews_avg,
    coalesce(lk.links, '[]'::jsonb),
    coalesce(cp.phones, ARRAY[]::text[]),
    at.source,
    at.campaign,
    greatest(u."updatedAt", p."updatedAt", l.last_change_at, s.last_seen_at)
  FROM "User" u
  LEFT JOIN "SellerProfile" p ON p."userId" = u.id
  LEFT JOIN LATERAL (
    SELECT max("createdAt") AS last_seen_at FROM "AuthSession" WHERE "userId" = u.id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE status IN ('ACTIVE', 'PUBLISHED'))::int AS active,
      count(*) FILTER (WHERE status = 'DRAFT')::int AS draft,
      count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
      count(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
      count(*) FILTER (WHERE status = 'ARCHIVED')::int AS archived,
      count(*) FILTER (WHERE status = 'SOLD')::int AS sold,
      max("createdAt") AS last_listing_at,
      max("updatedAt") AS last_change_at
    FROM "Listing"
    WHERE "ownerId" = u.id AND "deletedAt" IS NULL
  ) l ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE lv."createdAt" > now() - interval '30 days')::int AS views_30d,
      count(*)::int AS views_total
    FROM "ListingView" lv
    JOIN "Listing" li ON li.id = lv."listingId"
    WHERE li."ownerId" = u.id
  ) v ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS leads_total
    FROM "Lead" le JOIN "Listing" li ON li.id = le."listingId"
    WHERE li."ownerId" = u.id
  ) ld ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS threads_total
    FROM "MessageThread" mt
    WHERE mt."sellerUserId" = u.id OR (p.id IS NOT NULL AND mt."sellerProfileId" = p.id)
  ) th ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS deals_total FROM "Deal" WHERE "sellerUserId" = u.id
  ) dl ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS reviews_count, round(avg(rating)::numeric, 2) AS reviews_avg
    FROM "Review" WHERE "targetUserId" = u.id AND status = 'PUBLISHED'
  ) rv ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('type', type::text, 'url', url) ORDER BY type) AS links
    FROM "ProfileLink" WHERE p.id IS NOT NULL AND "sellerProfileId" = p.id
  ) lk ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(phone ORDER BY "isPrimary" DESC) AS phones
    FROM "SellerContactPerson" WHERE p.id IS NOT NULL AND "sellerProfileId" = p.id
  ) cp ON true
  LEFT JOIN LATERAL (
    SELECT source, campaign FROM "UserAttribution"
    WHERE "userId" = u.id ORDER BY "registeredAt" LIMIT 1
  ) at ON true
  WHERE u.role = 'USER'
$fn$;

COMMENT ON FUNCTION crm.accounts() IS 'Аккаунты vin2win для CRM: профиль, объявления, активность. Только чтение';

REVOKE ALL ON FUNCTION crm.accounts() FROM PUBLIC;
GRANT USAGE ON SCHEMA crm TO crm_reader;
GRANT EXECUTE ON FUNCTION crm.accounts() TO crm_reader;

-- crm_reader больше не читает таблицы напрямую — только витрину
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM crm_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM crm_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE gen_user IN SCHEMA public REVOKE ALL ON TABLES FROM crm_reader;

COMMIT;
