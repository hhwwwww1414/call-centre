import { z } from 'zod';

import { badRequest, handleRoute, serviceUnavailable } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/rbac';
import { logger } from '@/lib/logger';
import { isValidPhone, toE164 } from '@/lib/phone';
import { getProviderName, getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const originateSchema = z.object({
  phone: z.string().trim().refine(isValidPhone, 'Проверьте номер телефона'),
});

/**
 * Звонок в один клик: АТС сначала звонит на SIP-телефон менеджера, а после
 * ответа соединяет с клиентом. Сам звонок появится в журнале из вебхука.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { phone } = originateSchema.parse(await request.json());

    const provider = getTelephonyProvider();
    if (!provider.isConfigured()) {
      throw serviceUnavailable('Телефония не настроена — обратитесь к администратору');
    }
    if (!user.extension && getProviderName() !== 'mock') {
      throw badRequest(
        'У вас не указан внутренний номер SIP. Попросите администратора добавить его',
      );
    }

    try {
      const result = await provider.originate({
        fromExtension: user.extension ?? '',
        toNumber: toE164(phone) || phone,
        userId: user.id,
      });

      await writeAudit({
        actorId: user.id,
        action: 'call.originate',
        entityType: 'Call',
        entityId: result.externalId,
        meta: { provider: provider.name },
      });

      return { ok: true, externalId: result.externalId };
    } catch (err) {
      logger.warn({ err, userId: user.id }, 'originate failed');
      throw serviceUnavailable(
        'АТС не приняла вызов. Проверьте, что SIP-телефон в сети, и повторите',
      );
    }
  });
}
