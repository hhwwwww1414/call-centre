import { NextResponse } from 'next/server';

import { clientIp } from '@/lib/api';
import { logger } from '@/lib/logger';
import { SipuniTelephonyProvider } from '@/lib/telephony/providers/sipuni';
import { routeByOwner } from '@/lib/telephony/routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Распределение звонков с общего номера — функция «HTTP-запрос» в схеме
 * Sipuni (https://doc.sipuni.com/articles/570-571-607--http-zapros/).
 *
 * Sipuni шлёт GET ?fromnum=&tonum=&dtmf=&label=&time= и ждёт JSON:
 *   choice — ветка схемы: 1 (правая) — ответственный найден, 0 (левая) — нет;
 *   number — внутренний номер, который АТС вызовет первым (15 секунд);
 *   name   — подпись на экране SIP-телефона.
 *
 * Любой сбой — это choice 0: клиент должен дозвониться в любом случае,
 * пусть и не своему менеджеру.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = new SipuniTelephonyProvider();

  if (!provider.verifyWebhook({ rawBody: '', headers: {}, url: request.url })) {
    logger.warn({ ip: clientIp(request.headers) }, 'sipuni routing: неверный токен');
    return NextResponse.json({ choice: 0, error: 'invalid_token' }, { status: 401 });
  }

  const fromnum = url.searchParams.get('fromnum') ?? '';
  try {
    const decision = await routeByOwner(fromnum);
    logger.info(
      {
        tonum: url.searchParams.get('tonum'),
        routed: Boolean(decision.extension),
        extension: decision.extension,
      },
      'sipuni routing',
    );

    if (!decision.extension) {
      return NextResponse.json({
        choice: 0,
        ...(decision.callerName ? { name: decision.callerName } : {}),
      });
    }
    return NextResponse.json({
      choice: 1,
      number: decision.extension,
      name: decision.callerName ?? fromnum,
    });
  } catch (err) {
    logger.error({ err }, 'sipuni routing failed');
    return NextResponse.json({ choice: 0 });
  }
}

export const POST = GET;
