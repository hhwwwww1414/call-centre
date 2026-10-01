import { headers } from 'next/headers';

import { clientIp } from '@/lib/api';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.deactivate'
  | 'user.activate'
  | 'user.password.reset'
  | 'user.password.change'
  | 'user.invite.create'
  | 'user.invite.accept'
  | 'auth.login'
  | 'auth.login.failed'
  | 'call.outcome.update'
  | 'call.comment.update'
  | 'call.tags.update'
  | 'call.summary.update'
  | 'call.important.update'
  | 'call.export'
  | 'call.test.generate'
  | 'call.result.update'
  | 'call.originate'
  | 'task.create'
  | 'task.update'
  | 'task.cancel'
  | 'task.delete'
  | 'contact.create'
  | 'contact.update'
  | 'contact.owner.update'
  | 'contact.block'
  | 'contact.unblock'
  | 'settings.update'
  | 'profile.update';

type AuditInput = {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Запись в аудит никогда не должна ронять основное действие: если лог
 * не записался, пользователь всё равно получил результат.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const h = await headers();
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        meta: (input.meta ?? undefined) as never,
        ip: clientIp(h),
        userAgent: h.get('user-agent')?.slice(0, 400) ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'audit write failed');
  }
}

/** Вариант для контекстов без next/headers (скрипты, вебхуки). */
export async function writeAuditRaw(
  input: AuditInput & { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        meta: (input.meta ?? undefined) as never,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'audit write failed');
  }
}
