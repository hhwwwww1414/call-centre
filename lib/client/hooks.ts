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
  PendingResultsResponse,
  TaskItem,
  TaskActivityResponse,
  TaskListResponse,
  ContactDetailsResponse,
  ContactHistoryView,
  ContactAuditResponse,
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
    mutationFn: (input: {
      outcome?: string;
      comment?: string | null;
      tags?: string[];
      result?: 'SUCCESS' | 'FAILURE' | null;
      summary?: string | null;
      isImportant?: boolean;
    }) => apiFetch(`/api/calls/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calls'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

/** Звонки без итога — ключ под ['calls'], чтобы realtime обновлял и его. */
export function usePendingResults() {
  return useQuery({
    queryKey: ['calls', 'pending'],
    queryFn: () => apiFetch<PendingResultsResponse>('/api/calls/pending'),
    refetchOnWindowFocus: true,
  });
}

export type CallResultInput = {
  result: 'SUCCESS' | 'FAILURE';
  outcome?: string;
  summary?: string;
  isImportant: boolean;
};

export function useSubmitCallResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CallResultInput & { id: string }) =>
      apiFetch(`/api/calls/${id}/result`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calls'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

/** Звонок через АТС: сначала звонит SIP-телефон менеджера, затем клиент. */
export function useOriginateCall() {
  return useMutation({
    mutationFn: (phone: string) =>
      apiFetch<{ ok: boolean; externalId: string }>('/api/calls/originate', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
  });
}

export function useTasks(params: { status: string; userId?: string | undefined }) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => apiFetch<TaskListResponse>(`/api/tasks${buildQuery(params)}`),
  });
}

export function useTaskActivity(id: string | null) {
  return useInfiniteQuery({
    queryKey: ['tasks', 'activity', id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<TaskActivityResponse>(
        `/api/tasks/${id}/activity${buildQuery({ cursor: pageParam })}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(id),
  });
}

export type TaskAssignee = { id: string; name: string; extension: string | null; role: string };

export function useTaskAssignees(enabled: boolean) {
  return useQuery({
    queryKey: ['tasks', 'assignees'],
    queryFn: () => apiFetch<{ items: TaskAssignee[] }>('/api/tasks/assignees'),
    enabled,
    staleTime: 60_000,
  });
}

export type TaskCreatePayload = {
  title: string;
  description?: string;
  metric: string;
  target: number;
  assigneeIds: string[];
  dueAt?: string;
};

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreatePayload) =>
      apiFetch<{ ok: boolean; created: number }>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      apiFetch<TaskItem>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
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

export function useContact(id: string | null, view: ContactHistoryView = 'all', tag?: string) {
  return useInfiniteQuery({
    queryKey: ['contacts', 'detail', id, view, tag],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<ContactDetailsResponse>(
        `/api/contacts/${id}${buildQuery({ view, tag, cursor: pageParam })}`,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(id),
  });
}

export function useContactAudit(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['contacts', 'audit', id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<ContactAuditResponse>(
        `/api/contacts/${id}/audit${buildQuery({ cursor: pageParam })}`,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { phone: string; name?: string; company?: string; note?: string }) =>
      apiFetch<{ id: string }>('/api/contacts', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['calls'] }),
        queryClient.invalidateQueries({ queryKey: ['audit'] }),
      ]);
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
