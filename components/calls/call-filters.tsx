'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import * as React from 'react';

import {
  DIRECTION_OPTIONS,
  OUTCOME_OPTIONS,
  STATUS_OPTIONS,
} from '@/components/calls/call-presentation';
import { PeriodPicker, type PeriodValue } from '@/components/common/period-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BottomSheetContent, Dialog, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Switch } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UserRow } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';

export type CallFiltersValue = {
  period: PeriodValue;
  direction?: string;
  status?: string;
  outcome?: string;
  userId?: string;
  search: string;
  hasRecording: boolean;
  hasComment: boolean;
  important: boolean;
};

export const EMPTY_FILTERS: CallFiltersValue = {
  period: { preset: '30d' },
  search: '',
  hasRecording: false,
  hasComment: false,
  important: false,
};

const ALL = '__all__';

export function countActiveFilters(value: CallFiltersValue): number {
  let count = 0;
  if (value.direction) count += 1;
  if (value.status) count += 1;
  if (value.outcome) count += 1;
  if (value.userId) count += 1;
  if (value.search.trim()) count += 1;
  if (value.hasRecording) count += 1;
  if (value.hasComment) count += 1;
  if (value.important) count += 1;
  if (value.period.preset !== EMPTY_FILTERS.period.preset) count += 1;
  return count;
}

type Props = {
  value: CallFiltersValue;
  onChange: (next: CallFiltersValue) => void;
  managers?: UserRow[];
  showManagerFilter?: boolean;
};

/** Фильтры журнала: строкой на десктопе, нижним листом на телефоне (ТЗ 2.5). */
export function CallFilters({ value, onChange, managers = [], showManagerFilter }: Props) {
  const [open, setOpen] = React.useState(false);
  const active = countActiveFilters(value);

  const controls = (
    <FilterControls
      value={value}
      onChange={onChange}
      managers={managers}
      showManagerFilter={showManagerFilter ?? false}
    />
  );

  return (
    <>
      {/* Десктоп и планшет */}
      <div className="hidden flex-wrap items-end gap-2 md:flex">{controls}</div>

      {/* Телефон: одна кнопка, всё остальное — в нижнем листе */}
      <div className="flex items-center gap-2 md:hidden">
        <Input
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
          placeholder={ru.calls.searchPlaceholder}
          aria-label={ru.common.search}
          inputMode="search"
          className="flex-1"
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={ru.common.filters}
              className="relative"
            >
              <SlidersHorizontal aria-hidden />
              {active > 0 ? (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[var(--brand)] text-[10px] font-semibold text-[var(--brand-foreground)]">
                  {active}
                </span>
              ) : null}
            </Button>
          </DialogTrigger>
          <BottomSheetContent>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <DialogTitle className="text-sm font-semibold">{ru.common.filters}</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label={ru.common.close}
              >
                <X aria-hidden />
              </Button>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">{controls}</div>
            <div className="flex gap-2 border-t border-[var(--border)] px-4 py-3">
              <Button variant="ghost" className="flex-1" onClick={() => onChange(EMPTY_FILTERS)}>
                {ru.common.reset}
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => setOpen(false)}>
                {ru.common.show}
              </Button>
            </div>
          </BottomSheetContent>
        </Dialog>
      </div>

      {active > 0 ? (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-2xs hidden items-center gap-1 text-[var(--text-muted)] hover:text-[var(--foreground)] md:inline-flex"
        >
          <X className="size-3" aria-hidden />
          {ru.common.reset}
          <Badge tone="brand">{active}</Badge>
        </button>
      ) : null}
    </>
  );
}

function FilterControls({
  value,
  onChange,
  managers,
  showManagerFilter,
}: {
  value: CallFiltersValue;
  onChange: (next: CallFiltersValue) => void;
  managers: UserRow[];
  showManagerFilter: boolean;
}) {
  const set = (patch: Partial<CallFiltersValue>) => onChange({ ...value, ...patch });

  return (
    <>
      <Field label={ru.period.label} className="min-w-44">
        <PeriodPicker value={value.period} onChange={(period) => set({ period })} />
      </Field>

      <Field label={ru.calls.filterDirection} className="min-w-36">
        <Select
          value={value.direction ?? ALL}
          onValueChange={(next) => set({ direction: next === ALL ? undefined : next })}
        >
          <SelectTrigger aria-label={ru.calls.filterDirection}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{ru.common.all}</SelectItem>
            {DIRECTION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={ru.calls.filterStatus} className="min-w-36">
        <Select
          value={value.status ?? ALL}
          onValueChange={(next) => set({ status: next === ALL ? undefined : next })}
        >
          <SelectTrigger aria-label={ru.calls.filterStatus}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{ru.common.all}</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={ru.calls.filterOutcome} className="min-w-40">
        <Select
          value={value.outcome ?? ALL}
          onValueChange={(next) => set({ outcome: next === ALL ? undefined : next })}
        >
          <SelectTrigger aria-label={ru.calls.filterOutcome}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{ru.common.all}</SelectItem>
            {OUTCOME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {showManagerFilter ? (
        <Field label={ru.calls.filterManager} className="min-w-44">
          <Select
            value={value.userId ?? ALL}
            onValueChange={(next) => set({ userId: next === ALL ? undefined : next })}
          >
            <SelectTrigger aria-label={ru.calls.filterManager}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{ru.common.all}</SelectItem>
              <SelectItem value="unassigned">{ru.calls.unassigned}</SelectItem>
              {managers.map((manager) => (
                <SelectItem key={manager.id} value={manager.id}>
                  {manager.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <Field label={ru.common.search} className="hidden min-w-52 md:flex">
        <Input
          value={value.search}
          onChange={(event) => set({ search: event.target.value })}
          placeholder={ru.calls.searchPlaceholder}
          inputMode="search"
        />
      </Field>

      <div className="flex flex-col gap-2 pb-1 md:flex-row md:items-center md:gap-4">
        <label className="flex min-h-11 items-center gap-2 text-xs text-[var(--text-secondary)] md:min-h-0">
          <Switch
            checked={value.hasRecording}
            onCheckedChange={(checked) => set({ hasRecording: checked })}
            aria-label={ru.calls.hasRecording}
          />
          {ru.calls.hasRecording}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-xs text-[var(--text-secondary)] md:min-h-0">
          <Switch
            checked={value.hasComment}
            onCheckedChange={(checked) => set({ hasComment: checked })}
            aria-label={ru.calls.hasComment}
          />
          {ru.calls.hasComment}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-xs text-[var(--text-secondary)] md:min-h-0">
          <Switch
            checked={value.important}
            onCheckedChange={(checked) => set({ important: checked })}
            aria-label={ru.callResult.filterImportant}
          />
          {ru.callResult.filterImportant}
        </label>
      </div>
    </>
  );
}
