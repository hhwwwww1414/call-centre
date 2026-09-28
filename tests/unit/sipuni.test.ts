import { CallStatus, Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SessionUser } from '@/lib/auth/scope';
import { canManageTasks, taskCallWhere, taskScopeFilter } from '@/lib/services/tasks';
import { canTransition } from '@/lib/telephony/ingest';
import { SipuniTelephonyProvider } from '@/lib/telephony/providers/sipuni';

const ENV = { ...process.env };

function provider() {
  process.env.SIPUNI_USER = '012345';
  process.env.SIPUNI_SECRET = 'secret-key';
  process.env.SIPUNI_WEBHOOK_TOKEN = 'hook-token';
  return new SipuniTelephonyProvider();
}

afterEach(() => {
  process.env = { ...ENV };
});

describe('Sipuni: подпись запросов', () => {
  it('md5 от значений через «+», затем номер кабинета и ключ', () => {
    const sipuni = provider();
    // Порядок из документации callback/call_number: antiaon, phone, reverse, sipnumber
    const expected = createHash('md5')
      .update('0+79031234567+0+101+012345+secret-key')
      .digest('hex');
    expect(sipuni.signature(['0', '79031234567', '0', '101'])).toBe(expected);
  });
});

describe('Sipuni: вебхук', () => {
  it('принимает только правильный токен в URL', () => {
    const sipuni = provider();
    const base = 'https://crm.example/api/webhooks/sipuni';
    expect(
      sipuni.verifyWebhook({ rawBody: '', headers: {}, url: `${base}?token=hook-token` }),
    ).toBe(true);
    expect(sipuni.verifyWebhook({ rawBody: '', headers: {}, url: `${base}?token=wrong` })).toBe(
      false,
    );
    expect(sipuni.verifyWebhook({ rawBody: '', headers: {}, url: base })).toBe(false);
  });

  it('без токена в окружении вебхук закрыт', () => {
    delete process.env.SIPUNI_WEBHOOK_TOKEN;
    const sipuni = new SipuniTelephonyProvider();
    expect(sipuni.verifyWebhook({ rawBody: '', headers: {}, url: 'https://x/?token=' })).toBe(
      false,
    );
  });
});

describe('Sipuni: разбор событий', () => {
  let sipuni: SipuniTelephonyProvider;
  beforeEach(() => {
    sipuni = provider();
  });

  const inbound = {
    call_id: '1419783130.15593',
    src_num: '79555555555',
    src_type: '1',
    dst_num: '012345101',
    dst_type: '2',
    short_src_num: '79555555555',
    short_dst_num: '101',
  };

  it('event=1 — входящий дозвон, менеджер по короткому номеру', () => {
    const event = sipuni.parseEvent({ ...inbound, event: '1', timestamp: '1700000000' });
    expect(event).toMatchObject({
      externalId: '1419783130.15593',
      type: 'ringing',
      direction: 'INBOUND',
      status: CallStatus.RINGING,
      fromNumber: '79555555555',
      toNumber: '101',
      extension: '101',
    });
    expect(event?.startedAt.toISOString()).toBe('2023-11-14T22:13:20.000Z');
  });

  it('event=3 — ответ', () => {
    const event = sipuni.parseEvent({ ...inbound, event: '3', timestamp: '1700000010' });
    expect(event?.status).toBe(CallStatus.IN_PROGRESS);
    expect(event?.answeredAt?.getTime()).toBe(1700000010_000);
  });

  it('event=2 ANSWER — завершён с записью и временем ответа', () => {
    const event = sipuni.parseEvent({
      ...inbound,
      event: '2',
      status: 'ANSWER',
      timestamp: '1700000100',
      call_start_timestamp: '1700000000',
      call_answer_timestamp: '1700000010',
      call_record_link: 'https://sipuni.com/record/abc.mp3',
    });
    expect(event).toMatchObject({
      type: 'completed',
      status: CallStatus.COMPLETED,
      recordingUrl: 'https://sipuni.com/record/abc.mp3',
    });
    expect(event?.startedAt.getTime()).toBe(1700000000_000);
    expect(event?.endedAt?.getTime()).toBe(1700000100_000);
  });

  it('входящий без ответа — пропущен, какой бы ни была причина', () => {
    for (const status of ['NOANSWER', 'BUSY', 'CANCEL', 'CHANUNAVAIL']) {
      const event = sipuni.parseEvent({
        ...inbound,
        event: '2',
        status,
        call_answer_timestamp: '0',
      });
      expect(event?.status).toBe(CallStatus.MISSED);
    }
  });

  it('исходящий: инициатор по short_src_num, статусы неуспеха различаются', () => {
    const outbound = {
      call_id: 'out-1',
      src_num: '012345101',
      src_type: '2',
      short_src_num: '101',
      dst_num: '79031234567',
      dst_type: '1',
    };
    const ringing = sipuni.parseEvent({ ...outbound, event: '1' });
    expect(ringing).toMatchObject({
      direction: 'OUTBOUND',
      extension: '101',
      toNumber: '79031234567',
    });

    expect(sipuni.parseEvent({ ...outbound, event: '2', status: 'BUSY' })?.status).toBe(
      CallStatus.BUSY,
    );
    expect(sipuni.parseEvent({ ...outbound, event: '2', status: 'NOANSWER' })?.status).toBe(
      CallStatus.NO_ANSWER,
    );
    expect(sipuni.parseEvent({ ...outbound, event: '2', status: 'CANCEL' })?.status).toBe(
      CallStatus.CANCELED,
    );
    expect(sipuni.parseEvent({ ...outbound, event: '2', status: 'CONGESTION' })?.status).toBe(
      CallStatus.FAILED,
    );
  });

  it('при дозвоне на группу менеджер берётся из last_called', () => {
    const event = sipuni.parseEvent({
      ...inbound,
      dst_num: '84999999999',
      dst_type: '1',
      short_dst_num: '84999999999',
      last_called: '102,103',
      event: '2',
      status: 'ANSWER',
      call_answer_timestamp: '1700000010',
    });
    expect(event?.extension).toBe('102');
  });

  it('пропускает промежуточное завершение, внутренние звонки и мусор', () => {
    expect(sipuni.parseEvent({ ...inbound, event: '4', status: 'ANSWER' })).toBeNull();
    expect(sipuni.parseEvent({ ...inbound, src_type: '2', dst_type: '2', event: '1' })).toBeNull();
    expect(sipuni.parseEvent({ event: '1' })).toBeNull();
    expect(sipuni.parseEvent({ call_id: 'x', event: '9' })).toBeNull();
  });
});

describe('смена статуса звонка при событиях не по порядку', () => {
  it('состоявшийся разговор не откатывается', () => {
    expect(canTransition(CallStatus.COMPLETED, CallStatus.RINGING)).toBe(false);
    expect(canTransition(CallStatus.COMPLETED, CallStatus.MISSED)).toBe(false);
    expect(canTransition(CallStatus.COMPLETED, CallStatus.COMPLETED)).toBe(true);
  });

  it('отказ соседнего плеча может смениться ответом', () => {
    expect(canTransition(CallStatus.MISSED, CallStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(CallStatus.NO_ANSWER, CallStatus.COMPLETED)).toBe(true);
    expect(canTransition(CallStatus.MISSED, CallStatus.RINGING)).toBe(false);
  });

  it('живой звонок движется вперёд свободно', () => {
    expect(canTransition(CallStatus.RINGING, CallStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(CallStatus.IN_PROGRESS, CallStatus.COMPLETED)).toBe(true);
  });
});

describe('задачи: права и подсчёт', () => {
  const user = (role: Role): SessionUser => ({
    id: `u-${role}`,
    email: 'x@x',
    name: 'x',
    phone: null,
    role,
    mustChangePassword: false,
    theme: 'system',
    timezone: 'Europe/Moscow',
    extension: null,
    soundNotifications: false,
  });

  it('ставят задачи админ и супервайзер, менеджер — нет', () => {
    expect(canManageTasks(Role.ADMIN)).toBe(true);
    expect(canManageTasks(Role.SUPERVISOR)).toBe(true);
    expect(canManageTasks(Role.MANAGER)).toBe(false);
  });

  it('менеджер видит только свои задачи, даже если просит чужие', () => {
    expect(taskScopeFilter(user(Role.MANAGER), 'someone-else')).toEqual({
      assigneeId: 'u-MANAGER',
    });
    expect(taskScopeFilter(user(Role.ADMIN), 'm1')).toEqual({ assigneeId: 'm1' });
    expect(taskScopeFilter(user(Role.ADMIN))).toEqual({});
  });

  it('считаются исходящие исполнителя внутри окна задачи', () => {
    const startsAt = new Date('2026-09-01T00:00:00Z');
    const dueAt = new Date('2026-09-05T00:00:00Z');
    const base = { assigneeId: 'm1', startsAt, dueAt };

    expect(taskCallWhere({ ...base, metric: 'CALLS' })).toMatchObject({
      userId: 'm1',
      direction: 'OUTBOUND',
      startedAt: { gte: startsAt, lte: dueAt },
    });
    expect(taskCallWhere({ ...base, metric: 'ANSWERED' }).status).toBe(CallStatus.COMPLETED);
    expect(taskCallWhere({ ...base, metric: 'SUCCESSFUL' }).result).toBe('SUCCESS');
    // Звонок, который ещё идёт, в «совершённые» не попадает
    const calls = taskCallWhere({ ...base, metric: 'CALLS' }).status as { in: CallStatus[] };
    expect(calls.in).not.toContain(CallStatus.RINGING);
    expect(calls.in).not.toContain(CallStatus.IN_PROGRESS);
  });
});

describe('правка пользователя', () => {
  it('поле, которого нет в запросе, не стирается (деактивация не сносит добавочный)', async () => {
    const { userUpdateSchema } = await import('@/lib/validation');
    const parsed = userUpdateSchema.parse({ isActive: false });
    expect(parsed.extension).toBeUndefined();
    expect(parsed.personalNumber).toBeUndefined();
  });

  it('пустое значение очищает, номер приводится к E.164', async () => {
    const { userUpdateSchema } = await import('@/lib/validation');
    expect(userUpdateSchema.parse({ extension: '', personalNumber: null })).toMatchObject({
      extension: null,
      personalNumber: null,
    });
    expect(userUpdateSchema.parse({ personalNumber: '8 (495) 123-45-67' }).personalNumber).toBe(
      '+74951234567',
    );
    expect(() => userUpdateSchema.parse({ personalNumber: '123' })).toThrow();
  });
});
