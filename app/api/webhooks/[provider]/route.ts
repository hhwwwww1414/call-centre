import { NextResponse } from 'next/server';

import { clientIp } from '@/lib/api';
import { logger } from '@/lib/logger';
import { getProviderName, getTelephonyProvider, type ProviderName } from '@/lib/telephony';
import { ingestCallEvent } from '@/lib/telephony/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ provider: string }> };

/**
 * Приём событий телефонии (ТЗ 7.3).
 *
 * Отвечаем 200 быстро: провайдеры считают медленный ответ отказом и
 * начинают ретраить. Всё тяжёлое — после отправки ответа.
 */
export async function POST(request: Request, { params }: Params) {
  const { provider: providerParam } = await params;
  const requested = providerParam.toLowerCase() as ProviderName;
  const active = getProviderName();
  const ip = clientIp(request.headers);

  if (requested !== 'mock' && requested !== 'exolve') {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404 });
  }

  // Фича-флаг: пока провайдер не включён, вебхук честно закрыт (ТЗ 0.2)
  if (requested !== active) {
    logger.warn({ requested, active, ip }, 'webhook: провайдер выключен');
    return NextResponse.json(
      {
        error: 'provider_disabled',
        message: `Провайдер «${requested}» выключен. Сейчас активен «${active}»`,
      },
      { status: 503 },
    );
  }

  const rawBody = await request.text();

  // Сырое тело — в лог, как требует ТЗ. Секретов в нём нет: подпись
  // приходит заголовком, а заголовки в лог не пишем
  logger.info({ provider: requested, ip, bodyLength: rawBody.length, rawBody }, 'webhook received');

  const telephony = getTelephonyProvider(active);

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  if (!telephony.verifyWebhook({ rawBody, headers })) {
    logger.warn({ provider: requested, ip }, 'webhook: подпись не сошлась');
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const event = telephony.parseEvent(parsedBody);
  if (!event) {
    // Неизвестное событие — не ошибка провайдера: подтверждаем приём,
    // иначе он будет ретраить его бесконечно
    logger.warn({ provider: requested }, 'webhook: событие не разобрано, пропускаем');
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const call = await ingestCallEvent(event, active);
    return NextResponse.json({ ok: true, callId: call.id });
  } catch (err) {
    logger.error({ err, externalId: event.externalId }, 'webhook: не удалось записать звонок');
    // 500 — чтобы провайдер повторил доставку: терять звонок нельзя
    return NextResponse.json({ error: 'ingest_failed' }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { provider } = await params;
  return NextResponse.json({
    provider,
    active: getProviderName(),
    message: 'Эндпоинт вебхука принимает POST',
  });
}
