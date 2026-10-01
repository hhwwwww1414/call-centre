'use client';

import { TaskMetric } from '@prisma/client';
import { Check, Target } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { ApiRequestError } from '@/lib/client/api';
import { useCreateTask, useTaskAssignees } from '@/lib/client/hooks';
import { ru } from '@/lib/i18n/ru';
import { cn } from '@/lib/utils';

const TARGET_PRESETS = [10, 20, 30, 50, 100];
const METRICS = Object.values(TaskMetric);

type DuePreset = 'none' | 'today' | 'tomorrow' | 'week' | 'custom';

const DUE_PRESETS: { value: DuePreset; label: string }[] = [
  { value: 'today', label: 'До конца дня' },
  { value: 'tomorrow', label: 'До завтра' },
  { value: 'week', label: 'Неделя' },
  { value: 'none', label: ru.tasks.noDue },
  { value: 'custom', label: 'Своя дата' },
];

/** Срок по пресету — конец дня в часовом поясе браузера администратора. */
function resolveDue(preset: DuePreset, custom: string): string | undefined {
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  switch (preset) {
    case 'today':
      return end.toISOString();
    case 'tomorrow':
      end.setDate(end.getDate() + 1);
      return end.toISOString();
    case 'week':
      end.setDate(end.getDate() + 7);
      return end.toISOString();
    case 'custom':
      return custom ? new Date(custom).toISOString() : undefined;
    default:
      return undefined;
  }
}

export function TaskCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const assignees = useTaskAssignees(open);
  const create = useCreateTask();

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [metric, setMetric] = React.useState<TaskMetric>(TaskMetric.CALLS);
  const [target, setTarget] = React.useState('30');
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [duePreset, setDuePreset] = React.useState<DuePreset>('today');
  const [customDue, setCustomDue] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const reset = () => {
    setTitle('');
    setDescription('');
    setMetric(TaskMetric.CALLS);
    setTarget('30');
    setSelected(new Set());
    setDuePreset('today');
    setCustomDue('');
    setErrors({});
  };

  const people = assignees.data?.items ?? [];
  const allSelected = people.length > 0 && people.every((p) => selected.has(p.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});

    create.mutate(
      {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        metric,
        target: Number(target),
        assigneeIds: Array.from(selected),
        ...(resolveDue(duePreset, customDue) ? { dueAt: resolveDue(duePreset, customDue) } : {}),
      },
      {
        onSuccess: (result) => {
          toast.success(ru.tasks.created(result.created));
          reset();
          onOpenChange(false);
        },
        onError: (error) => {
          if (error instanceof ApiRequestError && error.fields) setErrors(error.fields);
          else toast.error(error instanceof Error ? error.message : ru.errors.generic);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{ru.tasks.createTitle}</DialogTitle>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <Field label={ru.tasks.name} htmlFor="task-title" required error={errors.title}>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={ru.tasks.namePlaceholder}
                aria-invalid={Boolean(errors.title)}
                autoFocus
                maxLength={120}
              />
            </Field>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
                {ru.tasks.metric}
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {METRICS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMetric(value)}
                    aria-pressed={metric === value}
                    className={cn(
                      'flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors',
                      metric === value
                        ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                        : 'border-[var(--border)] hover:border-[var(--border-strong)]',
                    )}
                  >
                    <span className="text-xs font-medium text-[var(--foreground)]">
                      {ru.taskMetric[value]}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <Field
              label={ru.tasks.target}
              htmlFor="task-target"
              required
              hint={ru.tasks.targetHint}
              error={errors.target}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-28">
                  <Target
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--text-muted)]"
                    aria-hidden
                  />
                  <Input
                    id="task-target"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10000}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="numeric pl-8"
                    aria-invalid={Boolean(errors.target)}
                  />
                </div>
                {TARGET_PRESETS.map((preset) => (
                  <Chip
                    key={preset}
                    active={Number(target) === preset}
                    onClick={() => setTarget(String(preset))}
                  >
                    {preset}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label={ru.tasks.assignees} required error={errors.assigneeIds}>
              <div className="rounded-lg border border-[var(--border)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                  <span className="text-2xs text-[var(--text-muted)]">
                    {selected.size > 0 ? `Выбрано: ${selected.size}` : 'Никто не выбран'}
                  </span>
                  <button
                    type="button"
                    className="text-2xs font-medium text-[var(--brand)] hover:underline dark:text-[var(--brand-text)]"
                    onClick={() =>
                      setSelected(allSelected ? new Set() : new Set(people.map((p) => p.id)))
                    }
                  >
                    {allSelected ? ru.tasks.clearAll : ru.tasks.selectAll}
                  </button>
                </div>
                <ul className="max-h-52 overflow-y-auto p-1">
                  {assignees.isLoading ? (
                    <li className="p-2">
                      <Skeleton className="h-8 w-full" />
                    </li>
                  ) : (
                    people.map((person) => {
                      const checked = selected.has(person.id);
                      return (
                        <li key={person.id}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => toggle(person.id)}
                            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface)] max-md:min-h-11"
                          >
                            <span
                              className={cn(
                                'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                checked
                                  ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                                  : 'border-[var(--border-strong)]',
                              )}
                              aria-hidden
                            >
                              {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                            </span>
                            <Avatar name={person.name} size="sm" />
                            <span className="min-w-0 flex-1 truncate text-xs text-[var(--foreground)]">
                              {person.name}
                            </span>
                            <span className="text-2xs text-[var(--text-muted)]">
                              {person.extension
                                ? `доб. ${person.extension}`
                                : ru.roles[person.role as keyof typeof ru.roles]}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </Field>

            <Field label={ru.tasks.dueAt} error={errors.dueAt}>
              <div className="flex flex-wrap gap-2">
                {DUE_PRESETS.map((preset) => (
                  <Chip
                    key={preset.value}
                    active={duePreset === preset.value}
                    onClick={() => setDuePreset(preset.value)}
                  >
                    {preset.label}
                  </Chip>
                ))}
              </div>
              {duePreset === 'custom' ? (
                <Input
                  type="datetime-local"
                  value={customDue}
                  onChange={(e) => setCustomDue(e.target.value)}
                  className="mt-2 sm:w-64"
                  aria-label={ru.tasks.dueAt}
                />
              ) : null}
            </Field>

            <Field label={ru.tasks.description} htmlFor="task-description">
              <Textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={ru.tasks.descriptionPlaceholder}
                className="min-h-20"
                maxLength={1000}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {ru.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {selected.size > 1 ? `${ru.tasks.create} (${selected.size})` : ru.tasks.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'numeric h-8 rounded-full border px-3 text-xs font-medium transition-colors max-md:h-10',
        active
          ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] dark:text-[var(--brand-text)]'
          : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
      )}
    >
      {children}
    </button>
  );
}
