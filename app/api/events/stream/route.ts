import { canSeeAllCalls, requireUser } from '@/lib/auth/rbac';
import { logger } from '@/lib/logger';
import { callEventBus, type CallEvent } from '@/lib/realtime/bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** nginx рвёт молчащее соединение — шлём комментарий каждые 25 секунд (ТЗ 6). */
const HEARTBEAT_MS = 25_000;

/**
 * SSE-поток событий звонков.
 * Фильтрация по правам — здесь, на сервере: менеджер получает события только
 * по своим звонкам, даже если подставит чужой userId в запросе.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return new Response('unauthorized', { status: 401 });
  }

  const seesEverything = canSeeAllCalls(user.role);
  const userId = user.id;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // поток уже закрыт клиентом — это нормальный путь
        }
      };

      // Ретрай на стороне EventSource + первое событие, чтобы клиент
      // сразу перевёл индикатор в «подключено»
      send(`retry: 3000\n\n`);
      send(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

      unsubscribe = callEventBus.subscribe((event: CallEvent) => {
        if (!seesEverything && event.userId !== userId) return;
        const channel = event.event.startsWith('task.') ? 'task' : 'call';
        send(`event: ${channel}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      heartbeat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);
      if (typeof heartbeat.unref === 'function') heartbeat.unref();

      request.signal.addEventListener('abort', cleanup);

      logger.debug({ userId, seesEverything }, 'sse client connected');
    },

    cancel() {
      closed = true;
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
