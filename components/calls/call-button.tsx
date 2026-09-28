'use client';

import { PhoneCall } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button, type ButtonProps } from '@/components/ui/button';
import { useOriginateCall } from '@/lib/client/hooks';
import { ru } from '@/lib/i18n/ru';
import { formatPhone, telHref } from '@/lib/phone';

/**
 * Звонок через АТС в один клик. Если АТС недоступна, предлагаем набрать
 * номер с телефона — работа менеджера не должна вставать из-за телефонии.
 */
export function CallButton({
  phone,
  label,
  iconOnly = true,
  ...props
}: { phone: string; label?: string; iconOnly?: boolean } & Omit<ButtonProps, 'onClick'>) {
  const originate = useOriginateCall();
  const text = label ?? `${ru.calls.call} ${formatPhone(phone)}`;

  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'sm'}
      aria-label={text}
      title={text}
      loading={originate.isPending && !iconOnly}
      disabled={originate.isPending}
      onClick={(event) => {
        event.stopPropagation();
        originate.mutate(phone, {
          onSuccess: () =>
            toast.success(ru.calls.originateStarted, { description: ru.calls.originateHint }),
          onError: (error) =>
            toast.error(error instanceof Error ? error.message : ru.errors.generic, {
              action: {
                label: ru.calls.dialFromPhone,
                onClick: () => {
                  window.location.href = telHref(phone);
                },
              },
            }),
        });
      }}
      {...props}
    >
      <PhoneCall className={originate.isPending ? 'animate-pulse' : undefined} aria-hidden />
      {iconOnly ? null : ru.calls.call}
    </Button>
  );
}
