import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { contact: { findUnique } } }));

const { routeByOwner } = await import('@/lib/telephony/routing');

describe('распределение с общего номера', () => {
  beforeEach(() => findUnique.mockReset());

  const owner = { name: 'Юлия', extension: '201', isActive: true, deletedAt: null };

  it('звонок уходит ответственному за контакт', async () => {
    findUnique.mockResolvedValue({ name: 'Иван', company: 'ООО Ромашка', owner });
    const decision = await routeByOwner('79031234567');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phoneE164: '+79031234567' } }),
    );
    expect(decision).toEqual({
      extension: '201',
      callerName: 'Иван · ООО Ромашка',
      ownerName: 'Юлия',
    });
  });

  it('новый клиент — решения нет, АТС распределяет по общим правилам', async () => {
    findUnique.mockResolvedValue(null);
    expect((await routeByOwner('79031234567')).extension).toBeNull();
  });

  it('ответственный заблокирован или без добавочного — на общую очередь', async () => {
    findUnique.mockResolvedValue({
      name: null,
      company: null,
      owner: { ...owner, isActive: false },
    });
    expect((await routeByOwner('79031234567')).extension).toBeNull();
    findUnique.mockResolvedValue({
      name: null,
      company: null,
      owner: { ...owner, extension: null },
    });
    const decision = await routeByOwner('79031234567');
    expect(decision.extension).toBeNull();
    expect(decision.callerName).toBe('+7 (903) 123-45-67');
  });

  it('мусор вместо номера не ломает звонок', async () => {
    expect(await routeByOwner('anonymous')).toEqual({
      extension: null,
      callerName: null,
      ownerName: null,
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
