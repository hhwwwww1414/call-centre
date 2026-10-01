'use client';

import { useRouter } from 'next/navigation';
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
import { ApiRequestError } from '@/lib/client/api';
import { useCreateContact } from '@/lib/client/hooks';
import { ru } from '@/lib/i18n/ru';

const EMPTY = { phone: '', name: '', company: '', note: '' };

/** Новый контакт вручную. Ответственным становится тот, кто его завёл. */
export function ContactCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const create = useCreateContact();
  const [form, setForm] = React.useState(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [duplicateId, setDuplicateId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setErrors({});
    setDuplicateId(null);
  }, [open]);

  const set =
    (field: keyof typeof EMPTY) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setDuplicateId(null);
    if (!form.phone.trim()) {
      setErrors({ phone: 'Укажите номер телефона' });
      return;
    }
    create.mutate(
      {
        phone: form.phone,
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        ...(form.company.trim() ? { company: form.company.trim() } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      },
      {
        onSuccess: (contact) => {
          toast.success('Контакт создан');
          onOpenChange(false);
          router.push(`/contacts/${contact.id}`);
        },
        onError: (error) => {
          if (error instanceof ApiRequestError && error.fields) {
            const { contactId, ...fields } = error.fields;
            setErrors(fields);
            if (contactId) setDuplicateId(contactId);
          } else {
            toast.error(error instanceof Error ? error.message : ru.errors.saveFailed);
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Новый контакт</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field
              label={ru.contacts.columnPhone}
              htmlFor="new-contact-phone"
              required
              error={errors.phone}
            >
              <Input
                id="new-contact-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+7 900 000-00-00"
                aria-invalid={Boolean(errors.phone)}
                autoFocus
              />
            </Field>
            {duplicateId ? (
              <Button
                type="button"
                variant="link"
                className="-mt-2 h-auto self-start p-0 text-xs"
                onClick={() => {
                  onOpenChange(false);
                  router.push(`/contacts/${duplicateId}`);
                }}
              >
                Открыть существующий контакт
              </Button>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя или ФИО" htmlFor="new-contact-name" error={errors.name}>
                <Input
                  id="new-contact-name"
                  value={form.name}
                  onChange={set('name')}
                  maxLength={120}
                />
              </Field>
              <Field
                label={ru.contacts.company}
                htmlFor="new-contact-company"
                error={errors.company}
              >
                <Input
                  id="new-contact-company"
                  value={form.company}
                  onChange={set('company')}
                  maxLength={120}
                />
              </Field>
            </div>
            <Field label="О клиенте" htmlFor="new-contact-note" error={errors.note}>
              <Textarea
                id="new-contact-note"
                value={form.note}
                onChange={set('note')}
                rows={3}
                maxLength={2000}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {ru.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
