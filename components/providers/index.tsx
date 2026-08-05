'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import * as React from 'react';
import { Toaster } from 'sonner';

import { ThemeProvider, type ThemeMode } from '@/components/theme/theme-provider';
import { TooltipProvider } from '@/components/ui/misc';
import { ApiRequestError } from '@/lib/client/api';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // 4xx повторять бессмысленно: это отказ по правам или валидации
          if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function AppProviders({
  children,
  themeMode,
}: {
  children: React.ReactNode;
  themeMode: ThemeMode;
}) {
  const [queryClient] = React.useState(createQueryClient);

  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider initialMode={themeMode}>
          <TooltipProvider delayDuration={250}>
            {children}
            <Toaster
              position="bottom-right"
              closeButton
              toastOptions={{
                classNames: {
                  toast:
                    'surface-card !bg-[var(--popover)] !text-[var(--popover-foreground)] !border-[var(--border)]',
                  description: '!text-[var(--text-muted)]',
                },
              }}
            />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
