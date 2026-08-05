'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import * as React from 'react';

import { apiFetch, buildQuery } from '@/lib/client/api';
import type {
  AnalyticsResponse,
  AuditResponse,
  CallDetailsResponse,
  CallListResponse,
  ContactDetailsResponse,
  ContactListResponse,
  StatsResponse,
  TelephonyStatusResponse,
  UserRow,
} from '@/lib/client/types';

export type CallQueryParams = Record<string, string | number | boolean | undefined>;

export function useCalls(params: CallQueryParams) {
  return useInfiniteQuery({
    queryKey: ['calls', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<CallListResponse>(`/api/calls${buildQuery({ ...params, cursor: pageParam })}`),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useCall(id: string | null) {
  return useQuery({
    queryKey: ['calls', 'detail', id],
    queryFn: () => apiFetch<CallDetailsResponse>(`/api/calls/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateCall(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { outcome?: string; comment?: string | null; tags?: string[] }) =>
      apiFetch(`/api/calls/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calls'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useStats(params: CallQueryParams) {
  return useQuery({
    queryKey: ['stats', params],
    queryFn: () => apiFetch<StatsResponse>(`/api/stats${buildQuery(params)}`),
  });
}

export function useAnalytics(params: CallQueryParams) {
  return useQuery({
    queryKey: ['analytics', params],
    queryFn: () => apiFetch<AnalyticsResponse>(`/api/analytics${buildQuery(params)}`),
  });
}

export function useContacts(params: CallQueryParams) {
  return useInfiniteQuery({
    queryKey: ['contacts', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<ContactListResponse>(`/api/contacts${buildQuery({ ...params, cursor: pageParam })}`),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: ['contacts', 'detail', id],
    queryFn: () => apiFetch<ContactDetailsResponse>(`/api/contacts/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateContact(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUsers(options?: Partial<UseQueryOptions<{ items: UserRow[] }>>) {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<{ items: UserRow[] }>('/api/users'),
    ...options,
  });
}

export function useAudit(params: CallQueryParams) {
  return useInfiniteQuery({
    queryKey: ['audit', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<AuditResponse>(`/api/audit${buildQuery({ ...params, cursor: pageParam })}`),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useTelephonyStatus() {
  return useQuery({
    queryKey: ['telephony'],
    queryFn: () => apiFetch<TelephonyStatusResponse>('/api/admin/telephony'),
  });
}

/** Дебаунс для поля поиска: запрос на каждый символ мучает и БД, и глаза. */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/** Копирование в буфер с подтверждением на кнопке. */
export function useCopy(resetMs = 2000) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetMs],
  );

  return { copied, copy };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
