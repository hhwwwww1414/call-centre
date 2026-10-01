'use client';

import { ArrowUpRight, ExternalLink } from 'lucide-react';
import type * as React from 'react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MarketplaceAccountView } from '@/lib/client/types';
import { safeExternalUrl } from '@/lib/external-url';
import { formatInZone, formatRelative } from '@/lib/time';
import { cn } from '@/lib/utils';

export const PROFILE_TYPE_LABEL: Record<string, string> = {
  DEALER: 'Дилер',
  PRIVATE: 'Частник',
};

/**
 * Доступ на площадке — те же группы, что на дашборде её админки.
 * Пока статус не синхронизирован, опираемся на модерацию профиля.
 */
const ACCESS: Record<string, { label: string; tone: BadgeProps['tone']; name?: string }> = {
  approved: { label: 'С доступом', tone: 'success' },
  pending: {
    label: 'Ждёт модерации',
    tone: 'attention',
    name: 'text-[var(--price-margin-badge-text)]',
  },
  email_unconfirmed: { label: 'Не подтвердил почту', tone: 'neutral' },
  rejected: { label: 'Отклонён', tone: 'danger', name: 'text-[var(--destructive)]' },
  restricted: { label: 'Доступ ограничен', tone: 'danger' },
  no_profile: { label: 'Без профиля продавца', tone: 'outline' },
};

const LEGACY_ACCESS: Record<string, string> = {
  APPROVED: 'approved',
  AUTO_APPROVED: 'approved',
  REJECTED: 'rejected',
  MANUAL_REVIEW: 'pending',
  PENDING: 'pending',
};

type AccessFields = {
  accessStatus?: string | null;
  verificationStatus: string | null;
  removedAt?: string | null;
};

function accessOf(account: AccessFields): string | null {
  return (
    account.accessStatus ??
    (account.verificationStatus ? (LEGACY_ACCESS[account.verificationStatus] ?? null) : null)
  );
}

const LINK_LABEL: Record<string, string> = {
  AVITO: 'Авито',
  AUTORU: 'Авто.ру',
  DROM: 'Дром',
  TELEGRAM: 'Telegram',
  INSTAGRAM: 'Instagram',
  WEBSITE: 'Сайт',
};

export const SEGMENT_LABEL: Record<string, string> = {
  marketplace: 'Все с vin2win',
  approved: 'С доступом',
  pending: 'Ждут модерации',
  email_unconfirmed: 'Не подтвердили почту',
  rejected: 'Отклонены',
  no_listings: 'Без объявлений',
  drafts: 'Есть черновики',
  dormant: 'Не заходил 14+ дней',
  dealers: 'Дилеры',
};

/**
 * Цвет имени клиента по доступу на площадке: отклонён — красный, ждёт
 * модерации — жёлтый. Удалённых с площадки не подсвечиваем.
 */
export function moderationNameClass(account: AccessFields | null): string | undefined {
  if (!account || account.removedAt) return undefined;
  const access = accessOf(account);
  return access ? ACCESS[access]?.name : undefined;
}

/**
 * Площадка отмечает онлайн раз в 2 минуты, пока вкладка открыта, — значит
 * свежее 2,5 минут означает «сейчас на сайте».
 */
const ONLINE_WINDOW_MS = 150_000;

export function isOnline(lastOnlineAt: string | null | undefined): boolean {
  return Boolean(lastOnlineAt && Date.now() - Date.parse(lastOnlineAt) < ONLINE_WINDOW_MS);
}

export function OnlineDot({ className }: { className?: string }) {
  return (
    <span
      className={cn('size-2 shrink-0 rounded-full bg-[var(--success)]', className)}
      aria-label="В сети"
      title="В сети"
    />
  );
}

export function AccessBadge({ account }: { account: AccessFields }) {
  const access = accessOf(account);
  const view = access ? ACCESS[access] : null;
  return view ? <Badge tone={view.tone}>{view.label}</Badge> : null;
}

/** Короткая отметка в списках: клиент есть на площадке. */
export function MarketplaceTag({
  account,
  className,
}: {
  account: {
    profileType: string | null;
    listingsActive: number;
    removedAt: string | null;
    lastOnlineAt?: string | null;
  } | null;
  className?: string;
}) {
  if (!account || account.removedAt) return null;
  const online = isOnline(account.lastOnlineAt);
  return (
    <span
      className={cn(
        'text-2xs inline-flex items-center gap-1 whitespace-nowrap text-[var(--text-muted)]',
        className,
      )}
    >
      <span className="font-semibold text-[var(--brand)] dark:text-[var(--brand-text)]">
        vin2win
      </span>
      {account.profileType ? <span>· {PROFILE_TYPE_LABEL[account.profileType]}</span> : null}
      <span className="numeric">· {account.listingsActive} объявл.</span>
      {online ? (
        <span className="inline-flex items-center gap-1 text-[var(--success)]">
          · <OnlineDot /> в сети
        </span>
      ) : null}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs text-[var(--text-muted)]">{label}</span>
      <span className="numeric text-lg leading-tight font-semibold text-[var(--foreground)]">
        {value}
      </span>
      {sub ? <span className="numeric text-2xs text-[var(--text-muted)]">{sub}</span> : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-2 last:border-b-0">
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="numeric text-right text-xs text-[var(--foreground)]">{children}</dd>
    </div>
  );
}

/** Всё, что менеджеру важно знать о клиенте на площадке, на одном экране. */
export function MarketplacePanel({
  account,
  links,
  timezone,
}: {
  account: MarketplaceAccountView;
  links: { profile: string; admin: string | null };
  timezone: string;
}) {
  const otherListings = [
    account.listingsDraft ? `черновики ${account.listingsDraft}` : null,
    account.listingsPending ? `на проверке ${account.listingsPending}` : null,
    account.listingsArchived ? `архив ${account.listingsArchived}` : null,
    account.listingsSold ? `продано ${account.listingsSold}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>vin2win</CardTitle>
          {account.profileType ? (
            <Badge tone="outline">{PROFILE_TYPE_LABEL[account.profileType]}</Badge>
          ) : null}
          <AccessBadge account={account} />
          {isOnline(account.lastOnlineAt) ? (
            <Badge tone="success">
              <OnlineDot />В сети
            </Badge>
          ) : null}
          {account.removedAt ? <Badge tone="danger">Удалён с площадки</Badge> : null}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" asChild>
            <a href={links.profile} target="_blank" rel="noopener noreferrer">
              Профиль
              <ArrowUpRight aria-hidden />
            </a>
          </Button>
          {links.admin ? (
            <Button variant="ghost" size="sm" asChild>
              <a href={links.admin} target="_blank" rel="noopener noreferrer">
                Админка
                <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {accessOf(account) === 'rejected' && account.moderationNote ? (
          <p className="rounded-[10px] bg-[var(--destructive-soft)] px-3 py-2 text-xs text-[var(--destructive)]">
            {account.moderationNote}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-6">
          <Stat
            label="Объявления"
            value={account.listingsActive}
            sub={otherListings || undefined}
          />
          <Stat label="Просмотры 30 дн" value={account.views30d} />
          <Stat label="Обращения" value={account.leadsTotal} />
          <Stat label="Чаты" value={account.threadsTotal} />
          <Stat label="Сделки" value={account.dealsTotal} />
          <Stat
            label="Отзывы"
            value={account.reviewsCount ? `★ ${account.reviewsAvg?.toFixed(1)}` : '—'}
            sub={account.reviewsCount ? `${account.reviewsCount} шт.` : undefined}
          />
        </div>

        <dl className="grid gap-x-8 sm:grid-cols-2">
          <Fact label="Регистрация">{formatInZone(account.registeredAt, timezone, 'date')}</Fact>
          <Fact label="Был в сети">
            {isOnline(account.lastOnlineAt)
              ? 'сейчас'
              : account.lastOnlineAt
                ? formatRelative(account.lastOnlineAt)
                : account.lastSeenAt
                  ? `вход ${formatRelative(account.lastSeenAt)}`
                  : 'не заходил'}
          </Fact>
          <Fact label="Последнее объявление">
            {account.lastListingAt ? formatInZone(account.lastListingAt, timezone, 'date') : '—'}
          </Fact>
          <Fact label="Город">{account.city || account.region || '—'}</Fact>
          <Fact label="Рейтинг доверия">{account.trustScore ?? '—'}</Fact>
          <Fact label="Профиль заполнен">
            {account.profileCompleteness != null ? `${account.profileCompleteness}%` : '—'}
          </Fact>
          <Fact label="Телефон">{account.phoneVerified ? 'подтверждён' : 'не подтверждён'}</Fact>
          <Fact label="Почта">{account.emailVerified ? 'подтверждена' : 'не подтверждена'}</Fact>
          <Fact label="ID на площадке">{account.publicId}</Fact>
          {account.legalName ? <Fact label="Юрлицо">{account.legalName}</Fact> : null}
          {account.email ? <Fact label="Email">{account.email}</Fact> : null}
          {account.source ? <Fact label="Откуда пришёл">{account.source}</Fact> : null}
        </dl>

        {account.links.length ? (
          <div className="flex flex-wrap gap-1.5">
            {account.links
              .flatMap((link) => {
                // Уже сохранённые снимки могли прийти до нормализации
                const href = safeExternalUrl(link.url);
                return href ? [{ ...link, url: href }] : [];
              })
              .map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
                >
                  {LINK_LABEL[link.type] ?? link.type}
                  <ArrowUpRight className="size-3" aria-hidden />
                </a>
              ))}
          </div>
        ) : null}

        <p className="text-2xs text-[var(--text-muted)]">
          Обновлено {formatRelative(account.syncedAt)}
        </p>
      </CardContent>
    </Card>
  );
}
