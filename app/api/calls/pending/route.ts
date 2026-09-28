import { handleRoute } from '@/lib/api';
import { requireUser } from '@/lib/auth/rbac';
import { getPendingResults } from '@/lib/services/calls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Звонки текущего пользователя, по которым ещё не указан итог. */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();
    return getPendingResults(user);
  });
}
