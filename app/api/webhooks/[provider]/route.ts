import { NextResponse } from 'next/server';

import { clientIp } from '@/lib/api';
import { logger } from '@/lib/logger';
import {
  getProviderName,
  getTelephonyProvider,
  PROVIDER_NAMES,
  type ProviderName,
} from '@/lib/telephony';
import { ingestCallEvent } from '@/lib/telephony/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ provider: string }> };

/**
 * Приём событий телефонии (ТЗ 7.3).
 *
 * Отвечаем 200 быстро: провайдеры считают медленный ответ отказом и
 * начинают ретраить. Всё тяжёлое — после отправки ответа.
 *
 * В каждом ответе есть success: Sipuni требует {"success": true} и при
 * некорректных ответах приостанавливает отправку событий.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(request, params);
}

/** Sipuni умеет слать события и GET-запросом — параметры тогда в query. */
export async function GET(request: Request, { params }: Params) {
  const { provider } = await params;
  const url = new URL(request.url);
  if (!url.searchParams.has('event')) {
    return NextResponse.json({
      success: true,
      provider,
      active: getProviderName(),
      message: 'Эндпоинт вебхука принимает события POST или GET',
    });
  }
  return handle(request, params);
}

async function handle(request: Request, params: Params['params']) {
  const { provider: providerParam } = await params;
  const requested = providerParam.toLowerCase() as ProviderName;
  const active = getProviderName();
  const ip = clientIp(request.headers);

  if (!PROVIDER_NAMES.includes(requested)) {
    return reply({ error: 'unknown_provider' }, 404);
  }

  // Фича-флаг: пока провайдер не включён, вебхук честно закрыт (ТЗ 0.2)
  if (requested !== active) {
    logger.warn({ requested, active, ip }, 'webhook: провайдер выключен');
    return reply(
      {
        error: 'provider_disabled',
        message: `Провайдер «${requested}» выключен. Сейчас активен «${active}»`,
      },
      503,
    );
  }

  const rawBody = request.method === 'POST' ? await request.text() : '';

  // Сырое тело — в лог, как требует ТЗ. Токен вебхука живёт в query,
  // поэтому URL целиком в лог не пишем
  logger.info({ provider: requested, ip, bodyLength: rawBody.length, rawBody }, 'webhook received');

  const telephony = getTelephonyProvider(active);

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  if (!telephony.verifyWebhook({ rawBody, headers, url: request.url })) {
    logger.warn({ provider: requested, ip }, 'webhook: подпись не сошлась');
    return reply({ error: 'invalid_signature' }, 401);
  }

  const parsedBody = parseBody(rawBody, headers['content-type'] ?? '', request.url);
  if (parsedBody === null) {
    return reply({ error: 'invalid_body' }, 400);
  }

  const event = telephony.parseEvent(parsedBody);
  if (!event) {
    // Неизвестное событие — не ошибка провайдера: подтверждаем приём,
    // иначе он будет ретраить его бесконечно
    logger.info({ provider: requested }, 'webhook: событие пропущено');
    return reply({ ignored: true });
  }

  try {
    const call = await ingestCallEvent(event, active);
    return reply({ callId: call.id });
  } catch (err) {
    logger.error({ err, externalId: event.externalId }, 'webhook: не удалось записать звонок');
    // 500 — чтобы провайдер повторил доставку: терять звонок нельзя
    return reply({ error: 'ingest_failed' }, 500);
  }
}

function reply(body: Record<string, unknown>, status = 200) {
  const ok = status < 300;
  return NextResponse.json({ success: ok, ok, ...body }, { status });
}

/**
 * Тело события в любом из форматов провайдеров: JSON, форма или query.
 * Параметры query подмешиваются снизу — служебный token их не перебивает,
 * а тело имеет приоритет.
 */
function parseBody(
  rawBody: string,
  contentType: string,
  url: string,
): Record<string, unknown> | null {
  const fromQuery: Record<string, string> = {};
  for (const [key, value] of new URL(url).searchParams.entries()) {
    if (key !== 'token') fromQuery[key] = value;
  }

  const trimmed = rawBody.trim();
  if (!trimmed) return fromQuery;

  if (contentType.includes('json') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object'
        ? { ...fromQuery, ...(parsed as Record<string, unknown>) }
        : null;
    } catch {
      return null;
    }
  }

  const form: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(trimmed).entries()) form[key] = value;
  return { ...fromQuery, ...form };
}
