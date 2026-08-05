import type { Role } from '@prisma/client';
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  PhoneCall,
  PhoneForwarded,
  Settings,
  User,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ru } from '@/lib/i18n/ru';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Точное совпадение пути — иначе «Дашборд» подсвечивался бы всегда. */
  exact?: boolean;
};

export const WORK_NAV: NavItem[] = [
  { href: '/', label: ru.nav.dashboard, icon: LayoutDashboard, exact: true },
  { href: '/calls', label: ru.nav.calls, icon: PhoneCall },
  { href: '/contacts', label: ru.nav.contacts, icon: Users },
  { href: '/profile', label: ru.nav.profile, icon: User },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin/users', label: ru.nav.users, icon: Users, adminOnly: true },
  { href: '/admin/analytics', label: ru.nav.analytics, icon: BarChart3, adminOnly: true },
  { href: '/admin/telephony', label: ru.nav.telephony, icon: PhoneForwarded, adminOnly: true },
  { href: '/admin/audit', label: ru.nav.audit, icon: ClipboardList, adminOnly: true },
  { href: '/admin/settings', label: ru.nav.settings, icon: Settings, adminOnly: true },
];

/** Нижняя навигация на телефоне — ровно 4 пункта (ТЗ 2.5). */
export const MOBILE_NAV: NavItem[] = [
  { href: '/calls', label: ru.nav.calls, icon: PhoneCall },
  { href: '/', label: ru.nav.dashboard, icon: LayoutDashboard, exact: true },
  { href: '/contacts', label: ru.nav.contacts, icon: Users },
  { href: '/profile', label: ru.nav.profile, icon: User },
];

export function visibleNav(role: Role): { work: NavItem[]; admin: NavItem[] } {
  return {
    work: WORK_NAV,
    admin: role === 'ADMIN' ? ADMIN_NAV : [],
  };
}

export function isActivePath(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Заголовок экрана в шапке. */
export function pageTitle(pathname: string): string {
  const all = [...WORK_NAV, ...ADMIN_NAV];
  const match = all
    .filter((item) => isActivePath(pathname, item))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? ru.app.name;
}
