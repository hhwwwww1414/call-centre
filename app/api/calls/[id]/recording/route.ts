import { NextResponse } from 'next/server';

import { handleRoute, notFound } from '@/lib/api';
import { callScopeFilter, requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { archiveRecording } from '@/lib/services/recordings';
import { signedUrl } from '@/lib/storage/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Запись разговора. Права проверяем здесь, наружу — короткоживущая ссылка
 * на наш S3. Пока запись не перенесена, отдаём её от провайдера через себя.
 */
export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const call = await prisma.call.findFirst({
      where: { id, ...callScopeFilter(user) },
      select: { id: true, recordingReady: true, recordingUrl: true, recordingKey: true },
    });
    if (!call?.recordingReady) throw notFound('Записи разговора нет');

    let key = call.recordingKey;
    if (!key) {
      const archived = await archiveRecording(call.id).catch((err) => {
        logger.warn({ err, callId: call.id }, 'перенос записи при прослушивании не удался');
        return false;
      });
      if (archived) {
        key =
          (await prisma.call.findUnique({ where: { id }, select: { recordingKey: true } }))
            ?.recordingKey ?? null;
      }
    }
    if (key) {
      return NextResponse.redirect(await signedUrl(key), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    if (!call.recordingUrl) throw notFound('Записи разговора нет');
    const upstream = await fetch(call.recordingUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    const size = Number(upstream.headers.get('content-length') ?? '1');
    if (!upstream.ok || !upstream.body || size === 0) {
      throw notFound('Запись ещё обрабатывается, попробуйте через минуту');
    }
    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
