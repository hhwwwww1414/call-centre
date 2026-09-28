import { prisma } from '@/lib/db';
import { formatPhone, toE164 } from '@/lib/phone';

export type RouteDecision = {
  /** Внутренний номер ответственного — АТС вызовет его первым. */
  extension: string | null;
  /** Подпись на экране SIP-телефона: кто звонит. */
  callerName: string | null;
  ownerName: string | null;
};

/**
 * Кому отдать звонок с общего номера: ответственному за контакт в CRM.
 * Ответственного нет, он заблокирован или без добавочного — решения нет,
 * и АТС распределяет звонок по своим общим правилам.
 */
export async function routeByOwner(fromNumber: string): Promise<RouteDecision> {
  const phoneE164 = toE164(fromNumber);
  if (!phoneE164) return { extension: null, callerName: null, ownerName: null };

  const contact = await prisma.contact.findUnique({
    where: { phoneE164 },
    select: {
      name: true,
      company: true,
      owner: { select: { name: true, extension: true, isActive: true, deletedAt: true } },
    },
  });

  const callerName = contact
    ? [contact.name, contact.company].filter(Boolean).join(' · ') || formatPhone(phoneE164)
    : null;

  const owner = contact?.owner;
  if (!owner || !owner.isActive || owner.deletedAt || !owner.extension) {
    return { extension: null, callerName, ownerName: null };
  }

  return { extension: owner.extension, callerName, ownerName: owner.name };
}
