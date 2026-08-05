'use client';

import { useMutation } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { useTheme, type ThemeMode } from '@/components/theme/theme-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Label } from '@/components/ui/field';
import { Switch } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch, ApiRequestError } from '@/lib/client/api';
import type { SessionUser } from '@/lib/auth/rbac';
import { ru } from '@/lib/i18n/ru';

export function ProfileScreen({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { update } = useSession();
  const { mode, setMode } = useTheme();

  const [form, setForm] = React.useState({
    name: user.name,
    phone: user.phone ?? '',
    timezone: user.timezone,
    soundNotifications: user.soundNotifications,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (input: typeof form & { theme: ThemeMode }) =>
      apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ ...input, phone: input.phone || undefined }),
      }),
    onSuccess: async () => {
      setErrors({});
      toast.success(ru.profile.updated);
      await update();
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.fields) setErrors(error.fields);
      else toast.error(ru.errors.saveFailed, { description: ru.errors.saveFailedHint });
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{ru.profile.subtitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({ ...form, theme: mode });
            }}
          >
            <Field label={ru.profile.name} htmlFor="profile-name" required error={errors.name}>
              <Input
                id="profile-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </Field>

            <Field label={ru.auth.email} htmlFor="profile-email">
              <Input id="profile-email" value={user.email} readOnly disabled />
            </Field>

            <Field label={ru.profile.phone} htmlFor="profile-phone" error={errors.phone}>
              <Input
                id="profile-phone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                inputMode="tel"
                placeholder="+7 999 123-45-67"
              />
            </Field>

            <Field label={ru.profile.timezone} htmlFor="profile-timezone">
              <Select
                value={form.timezone}
                onValueChange={(value) => setForm((prev) => ({ ...prev, timezone: value }))}
              >
                <SelectTrigger id="profile-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ru.timezones.map((zone) => (
                    <SelectItem key={zone.value} value={zone.value}>
                      {zone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={ru.profile.theme} htmlFor="profile-theme">
              <Select value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
                <SelectTrigger id="profile-theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{ru.theme.light}</SelectItem>
                  <SelectItem value="dark">{ru.theme.dark}</SelectItem>
                  <SelectItem value="system">{ru.theme.system}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] p-3">
              <div>
                <Label htmlFor="profile-sound">{ru.profile.sound}</Label>
                <p className="text-2xs text-[var(--text-muted)]">{ru.profile.soundHint}</p>
              </div>
              <Switch
                id="profile-sound"
                checked={form.soundNotifications}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, soundNotifications: checked }))
                }
              />
            </div>

            <Button type="submit" variant="primary" loading={save.isPending} className="self-start">
              {ru.common.save}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ru.profile.security}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" size="sm" onClick={() => router.push('/profile/password')}>
            {ru.auth.changePassword}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
