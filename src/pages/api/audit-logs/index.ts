import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import { getAuditLogs } from '@lib/audit';

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const action = url.searchParams.get('action') || undefined;
  const adminId = url.searchParams.get('adminId') || undefined;
  return new Response(JSON.stringify(await getAuditLogs({ limit, offset, action, adminId })));
};
