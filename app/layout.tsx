import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';

import { AppProviders } from '@/components/providers';
import { ThemeScript } from '@/components/theme/theme-script';
import { ru } from '@/lib/i18n/ru';
import { isThemeMode, THEME_COOKIE, type ThemeMode } from '@/lib/theme';

import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `${ru.app.name} · ${ru.app.subtitle}`,
    template: `%s · ${ru.app.name}`,
  },
  description: 'Внутренняя CRM колл-центра VIN2WIN',
  robots: { index: false, follow: false },
  // Иконки берутся из app/icon.png и app/apple-icon.png — Next подхватывает
  // их по соглашению и сам проставляет размеры
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6f5' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const stored = cookieStore.get(THEME_COOKIE)?.value;
  const mode: ThemeMode = isThemeMode(stored) ? stored : 'system';

  // Класс проставляется здесь для SSR и уточняется инлайновым скриптом
  // до гидратации — вспышки чужой темы нет ни при первой загрузке, ни при F5
  const initialClass = mode === 'dark' ? 'theme-dark' : 'theme-light';

  return (
    <html lang="ru" suppressHydrationWarning>
      {/* The pre-hydration script resolves system/local theme on this element. */}
      <body
        className={`${inter.variable} ${initialClass}`}
        data-theme-mode={mode}
        suppressHydrationWarning
      >
        <ThemeScript />
        <AppProviders themeMode={mode}>{children}</AppProviders>
      </body>
    </html>
  );
}
