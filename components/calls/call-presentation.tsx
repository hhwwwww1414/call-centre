'use client';

import { CallDirection, CallOutcome, CallStatus } from '@prisma/client';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { ru } from '@/lib/i18n/ru';
import { cn } from '@/lib/utils';

/**
 * Семантика цвета статусов (ТЗ 2.2): успешный — зелёный, пропущенный —
 * красный, идущий сейчас — жёлтый, исходящий без ответа — нейтральный.
 */
const STATUS_TONE: Record<CallStatus, BadgeProps['tone']> = {
  COMPLETED: 'success',
  IN_PROGRESS: 'attention',
  RINGING: 'attention',
  MISSED: 'danger',
  NO_ANSWER: 'neutral',
  BUSY: 'neutral',
  FAILED: 'danger',
  CANCELED: 'neutral',
};

const STATUS_ICON: Record<CallStatus, LucideIcon> = {
  COMPLETED: PhoneCall,
  IN_PROGRESS: PhoneCall,
  RINGING: PhoneCall,
  MISSED: PhoneMissed,
  NO_ANSWER: PhoneOff,
  BUSY: PhoneOff,
  FAILED: PhoneOff,
  CANCELED: PhoneOff,
};

export function statusColorVar(status: CallStatus): string {
  switch (status) {
    case CallStatus.COMPLETED:
      return 'var(--status-completed)';
    case CallStatus.RINGING:
    case CallStatus.IN_PROGRESS:
      return 'var(--status-active)';
    case CallStatus.MISSED:
    case CallStatus.FAILED:
      return 'var(--status-missed)';
    default:
      return 'var(--status-neutral)';
  }
}

export function CallStatusBadge({ status, className }: { status: CallStatus; className?: string }) {
  const Icon = STATUS_ICON[status];
  const live = status === CallStatus.RINGING || status === CallStatus.IN_PROGRESS;
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      <Icon className={cn('size-3', live && 'animate-pulse-dot')} aria-hidden />
      {ru.callStatus[status]}
    </Badge>
  );
}

export function DirectionIcon({
  direction,
  status,
  className,
}: {
  direction: CallDirection;
  status?: CallStatus;
  className?: string;
}) {
  const missed = status === CallStatus.MISSED;
  const Icon = missed ? PhoneMissed : direction === CallDirection.INBOUND ? PhoneIncoming : PhoneOutgoing;
  return (
    <Icon
      className={cn('size-4', className)}
      style={{ color: status ? statusColorVar(status) : 'var(--text-muted)' }}
      aria-label={ru.callDirection[direction]}
    />
  );
}

const OUTCOME_TONE: Record<CallOutcome, BadgeProps['tone']> = {
  NEW: 'neutral',
  INTERESTED: 'brand',
  CALLBACK: 'attention',
  REFUSED: 'outline',
  WRONG_NUMBER: 'outline',
  DEAL: 'success',
  SPAM: 'danger',
};

export function OutcomeBadge({ outcome, className }: { outcome: CallOutcome; className?: string }) {
  return (
    <Badge tone={OUTCOME_TONE[outcome]} className={className}>
      {ru.callOutcome[outcome]}
    </Badge>
  );
}

/** Внешняя сторона разговора — то, что показываем как «номер звонка». */
export function externalNumber(call: {
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
}): string {
  return call.direction === CallDirection.INBOUND ? call.fromNumber : call.toNumber;
}

export const OUTCOME_OPTIONS = Object.values(CallOutcome).map((value) => ({
  value,
  label: ru.callOutcome[value],
}));

export const STATUS_OPTIONS = Object.values(CallStatus).map((value) => ({
  value,
  label: ru.callStatus[value],
}));

export const DIRECTION_OPTIONS = Object.values(CallDirection).map((value) => ({
  value,
  label: ru.callDirection[value],
}));
