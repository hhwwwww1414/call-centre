import { handleRoute } from '@/lib/api';
import { requireUser } from '@/lib/auth/rbac';
import { listCalls } from '@/lib/services/calls';
import { callFiltersSchema, parseQuery } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const filters = parseQuery(callFiltersSchema, request.url);
    return listCalls(user, filters);
  });
}
