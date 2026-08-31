import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as campaigns from '@services/campaigns';

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = parseInt(url.searchParams.get('perPage') || '50', 10);
  const status = url.searchParams.get('status') || undefined;
  return new Response(JSON.stringify(await campaigns.listCampaignMessages(id || '', { page, perPage, status })));
};
