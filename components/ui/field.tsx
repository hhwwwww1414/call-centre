'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';

import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-xs font-medium text-[var(--text-secondary)]', className)}
      {...props}
    />
  );
}

const controlClasses = [
  'w-full rounded-md border border-[var(--input)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]',
  'placeholder:text-[var(--text-muted)]',
  'transition-[border-color,box-shadow] duration-150 focus-visible:border-[var(--ring)] focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)] focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-[invalid=true]:border-[var(--destructive)]',
].join(' ');

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(controlClasses, 'h-10 max-md:h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(controlClasses, 'min-h-24 py-2 leading-relaxed', className)}
      {...props}
    />
  );
}

type FieldProps = {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | undefined;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
};

/** Поле формы: подпись, подсказка и понятная ошибка под контролом. */
export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-[var(--destructive)]">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-2xs text-[var(--destructive)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-2xs text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
