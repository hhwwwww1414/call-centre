import { handleRoute, notFound } from '@/lib/api';
import { requireUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import {
  creditedTaskCallIds,
  getTaskView,
  taskCallRejection,
  taskCallWhere,
} from '@/lib/services/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const PAGE = 100;

/** Хронология задачи: звонки окна с объяснением зачёта и действия по ним. */
export async function GET(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;
    const task = await getTaskView(user, id);
    if (!task) throw notFound('Задача не найдена');
    const cursor = new URL(request.url).searchParams.get('cursor');

    const where = taskCallWhere(task);
    const [calls, total, credited] = await Promise.all([
      prisma.call.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: PAGE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          toNumber: true,
          startedAt: true,
          status: true,
          outcome: true,
          result: true,
          resultAt: true,
          summary: true,
          durationSeconds: true,
          waitSeconds: true,
          recordingReady: true,
          contact: { select: { name: true } },
        },
      }),
      prisma.call.count({ where }),
      creditedTaskCallIds(task),
    ]);

    const page = calls.slice(0, PAGE);
    const audits = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'Call', entityId: { in: page.map((call) => call.id) } },
          ...(!cursor ? [{ entityType: 'Task', entityId: { in: [task.id, task.batchId] } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entityId: true,
        meta: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    });

    return {
      task,
      total,
      calls: page.map((call) => {
        const isCredited = credited.has(call.id);
        return {
          ...call,
          credited: isCredited,
          reason: isCredited
            ? null
            : (taskCallRejection(task.metric, call) ?? 'Номер уже засчитан по другому звонку'),
        };
      }),
      nextCursor: calls.length > PAGE ? (page.at(-1)?.id ?? null) : null,
      audits,
    };
  });
}
