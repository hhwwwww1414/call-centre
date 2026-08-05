import { ru } from '@/lib/i18n/ru';

export class ApiRequestError extends Error {
  constructor(
    override readonly message: string,
    readonly status: number,
    readonly code: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Обёртка над fetch. Наружу отдаёт человеческий текст ошибки — компоненты
 * не должны разбирать коды и статусы (ТЗ 2.6).
 */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError(ru.errors.network, 0, 'network');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { message?: string; error?: string; fields?: Record<string, string> };
    throw new ApiRequestError(
      body.message ?? ru.errors.generic,
      response.status,
      body.error ?? 'unknown',
      body.fields,
    );
  }

  return payload as T;
}

export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
