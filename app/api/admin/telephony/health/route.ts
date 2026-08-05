import { handleRoute } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/rbac';
import { getProviderName, getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Кнопка «Проверить соединение» (ТЗ 5.8). */
export async function POST() {
  return handleRoute(async () => {
    await requireAdmin();
    const name = getProviderName();
    const provider = getTelephonyProvider(name);
    const result = await provider.healthCheck();
    return { provider: name, ...result };
  });
}
