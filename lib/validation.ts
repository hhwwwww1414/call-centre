import { CallDirection, CallOutcome, CallStatus, Role } from '@prisma/client';
import { z } from 'zod';

import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { isValidPhone, toE164 } from '@/lib/phone';

/** Одна схема на клиент и сервер (ТЗ 1). */

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`)
  .max(200, 'Пароль слишком длинный');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Укажите e-mail')
  .email('Похоже, в адресе опечатка')
  .toLowerCase();

export const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isValidPhone(v), 'Проверьте номер телефона')
  .transform((v) => (v ? toE164(v) : undefined));

export const periodPresetSchema = z.enum(['today', 'yesterday', '7d', '30d', 'custom']);
export type PeriodPreset = z.infer<typeof periodPresetSchema>;

export const periodSchema = z.object({
  preset: periodPresetSchema.default('today'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const callFiltersSchema = z.object({
  preset: periodPresetSchema.default('30d'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  direction: z.nativeEnum(CallDirection).optional(),
  status: z.nativeEnum(CallStatus).optional(),
  outcome: z.nativeEnum(CallOutcome).optional(),
  userId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  hasRecording: z.coerce.boolean().optional(),
  hasComment: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CallFilters = z.infer<typeof callFiltersSchema>;

export const callUpdateSchema = z.object({
  outcome: z.nativeEnum(CallOutcome).optional(),
  comment: z.string().max(4000, 'Комментарий длиннее 4000 символов').nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12, 'Не больше 12 тегов').optional(),
});

export const contactUpdateSchema = z.object({
  name: z.string().trim().max(120).nullish(),
  company: z.string().trim().max(120).nullish(),
  note: z.string().trim().max(2000).nullish(),
  isBlocked: z.boolean().optional(),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, 'Укажите ФИО').max(120),
  email: emailSchema,
  phone: optionalPhoneSchema,
  extension: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^[0-9*#+]{2,20}$/.test(v), 'Добавочный — только цифры'),
  role: z.nativeEnum(Role).default(Role.MANAGER),
  timezone: z.string().trim().min(1).default('Europe/Moscow'),
  /** invite — ссылка-приглашение (основной путь), password — одноразовый пароль. */
  accessMethod: z.enum(['invite', 'password']).default('invite'),
});
export type UserCreateInput = z.input<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: optionalPhoneSchema,
  extension: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9*#+]{2,20}$/.test(v), 'Добавочный — только цифры'),
  role: z.nativeEnum(Role).optional(),
  timezone: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Укажите имя').max(120),
  phone: optionalPhoneSchema,
  timezone: z.string().trim().min(1),
  theme: z.enum(['light', 'dark', 'system']),
  soundNotifications: z.boolean(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: passwordSchema,
    repeatPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.repeatPassword, {
    message: 'Пароли не совпадают',
    path: ['repeatPassword'],
  });

export const acceptInviteSchema = z
  .object({
    token: z.string().min(10),
    password: passwordSchema,
    repeatPassword: z.string(),
  })
  .refine((v) => v.password === v.repeatPassword, {
    message: 'Пароли не совпадают',
    path: ['repeatPassword'],
  });

export const auditFiltersSchema = z.object({
  actorId: z.string().optional(),
  action: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const contactFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  onlyBlocked: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const statsQuerySchema = z.object({
  preset: periodPresetSchema.default('today'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  userId: z.string().optional(),
});

export const testCallSchema = z.object({
  userId: z.string().optional(),
  direction: z.nativeEnum(CallDirection).optional(),
});

/** Разбор query-параметров запроса под zod-схему. */
export function parseQuery<T extends z.ZodTypeAny>(schema: T, url: string): z.infer<T> {
  const params = new URL(url).searchParams;
  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (value !== '') raw[key] = value;
  }
  return schema.parse(raw);
}
