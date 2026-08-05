'use client';

import * as React from 'react';

import { Input } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ru } from '@/lib/i18n/ru';
import type { PeriodPreset } from '@/lib/validation';

export type PeriodValue = { preset: PeriodPreset; from?: string; to?: string };

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: ru.period.today },
  { value: 'yesterday', label: ru.period.yesterday },
  { value: '7d', label: ru.period.days7 },
  { value: '30d', label: ru.period.days30 },
  { value: 'custom', label: ru.period.custom },
];

/** Дата из <input type="date"> в ISO с началом/концом суток. */
function toIso(dateValue: string, endOfDay: boolean): string | undefined {
  if (!dateValue) return undefined;
  const date = new Date(`${dateValue}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toDateInput(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function PeriodPicker({
  value,
  onChange,
  className,
}: {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={value.preset}
          onValueChange={(preset) => onChange({ preset: preset as PeriodPreset })}
        >
          <SelectTrigger className="sm:w-44" aria-label={ru.period.label}>
            <SelectValue placeholder={ru.period.label} />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {value.preset === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label={ru.common.from}
              value={toDateInput(value.from)}
              onChange={(event) =>
                onChange({ ...value, preset: 'custom', from: toIso(event.target.value, false) })
              }
              className="w-full sm:w-40"
            />
            <span className="text-xs text-[var(--text-muted)]">—</span>
            <Input
              type="date"
              aria-label={ru.common.to}
              value={toDateInput(value.to)}
              onChange={(event) =>
                onChange({ ...value, preset: 'custom', to: toIso(event.target.value, true) })
              }
              className="w-full sm:w-40"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
