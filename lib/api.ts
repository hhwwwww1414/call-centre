import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AuthError } from '@/lib/auth/rbac';
import { logger } from '@/lib/logger';

export type ApiError = {
  error: string;
  message: string;
  fields?: Record<string, string>;
};

export function jsonError(
  error: string,
  message: string,
  status: number,
  fields?: Record<string, string>,
) {
  const body: ApiError = { error, message };
  if (fields) body.fields = fields;
  return NextResponse.json(body, { status });
}

/**
 * Единый обработчик для API-роутов. Наружу отдаёт только человеческий текст:
 * ни стектрейса, ни SQL, ни имён переменных окружения (ТЗ 2.6, 3.4).
 */
export async function handleRoute<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const result = await fn();
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError(
        err.status === 401 ? 'unauthorized' : 'forbidden',
        err.message,
        err.status,
      );
    }

    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
      }
      return jsonError('validation', 'Проверьте заполнение полей', 422, fields);
    }

    if (err instanceof HttpError) {
      return jsonError(err.code, err.message, err.status, err.fields);
    }

    logger.error({ err }, 'unhandled api error');
    return jsonError('internal', 'Что-то пошло не так. Повторите попытку', 500);
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    override readonly message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, 'bad_request', message, fields);
export const notFound = (message = 'Не найдено') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, fields?: Record<string, string>) =>
  new HttpError(409, 'conflict', message, fields);
export const serviceUnavailable = (message: string) =>
  new HttpError(503, 'service_unavailable', message);

/** IP клиента за nginx. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? 'unknown';
}
