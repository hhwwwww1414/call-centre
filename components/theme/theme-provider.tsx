'use client';

import * as React from 'react';

import { THEME_COOKIE, THEME_STORAGE_KEY, type ThemeMode } from '@/lib/theme';

export type { ThemeMode };

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(mode: ThemeMode): 'light' | 'dark' {
  const resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
  const body = document.body;
  body.classList.remove('theme-light', 'theme-dark');
  body.classList.add(`theme-${resolved}`);
  body.dataset.themeMode = mode;
  return resolved;
}

export function ThemeProvider({
  children,
  initialMode = 'system',
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}) {
  const [mode, setModeState] = React.useState<ThemeMode>(initialMode);
  const [resolved, setResolved] = React.useState<'light' | 'dark'>(
    initialMode === 'dark' ? 'dark' : 'light',
  );

  // Синхронизируемся с тем, что уже поставил инлайновый скрипт в <head>:
  // он отработал до гидратации, и переигрывать его нельзя — будет мигание
  React.useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    const effective = stored ?? initialMode;
    setModeState(effective);
    setResolved(applyTheme(effective));
  }, [initialMode]);

  // Режим «как в системе» должен реагировать на смену темы ОС на лету
  React.useEffect(() => {
    if (mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = React.useCallback((next: ThemeMode) => {
    setModeState(next);
    setResolved(applyTheme(next));
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    // Cookie нужен серверу, чтобы SSR отдал сразу правильную тему (ТЗ 2.4)
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme нужно вызывать внутри ThemeProvider');
  return context;
}
