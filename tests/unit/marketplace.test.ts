import { describe, expect, it } from 'vitest';

import {
  accountPhones,
  companyName,
  displayName,
  marketplaceProfileUrl,
  marketplaceSegmentWhere,
  type MarketplaceRow,
} from '@/lib/services/marketplace';

const row = (patch: Partial<MarketplaceRow>): MarketplaceRow =>
  ({
    user_id: 'u1',
    user_name: null,
    profile_full_name: null,
    profile_name: null,
    legal_name: null,
    profile_type: 'PRIVATE',
    phone: null,
    extra_phones: [],
    ...patch,
  }) as MarketplaceRow;

describe('синхронизация с vin2win', () => {
  it('телефоны приводятся к +7, основной первым, без повторов', () => {
    expect(
      accountPhones(
        row({ phone: '89991234567', extra_phones: ['+7 999 123-45-67', '79990000001'] }),
      ),
    ).toEqual(['+79991234567', '+79990000001']);
    expect(accountPhones(row({ phone: null, extra_phones: null }))).toEqual([]);
  });

  it('имя — ФИО профиля, затем имя аккаунта; компания — только у дилера', () => {
    expect(displayName(row({ profile_full_name: 'Иванов Иван', user_name: 'ivan' }))).toBe(
      'Иванов Иван',
    );
    expect(displayName(row({ user_name: '  ' }))).toBeNull();
    expect(companyName(row({ profile_name: 'Иван', profile_type: 'PRIVATE' }))).toBeNull();
    expect(
      companyName(row({ profile_name: 'Auto', legal_name: 'ООО Авто', profile_type: 'DEALER' })),
    ).toBe('ООО Авто');
  });

  it('ссылка на публичный профиль ведёт на площадку', () => {
    expect(marketplaceProfileUrl('abc')).toBe('https://vin2win.ru/users/abc');
  });

  it('сегменты не включают удалённых с площадки', () => {
    for (const segment of [
      'marketplace',
      'no_listings',
      'rejected',
      'drafts',
      'dormant',
      'dealers',
    ] as const) {
      expect(marketplaceSegmentWhere(segment)).toMatchObject({ marketplace: { removedAt: null } });
    }
  });
});
