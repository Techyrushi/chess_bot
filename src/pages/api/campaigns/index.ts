import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as campaigns from '@services/campaigns';
import { createAuditLog } from '@lib/audit';
import { validateCampaignSendInput } from '@lib/validation';

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = parseInt(url.searchParams.get('perPage') || '20', 10);
  const status = url.searchParams.get('status') || undefined;
  return new Response(JSON.stringify(await campaigns.listCampaigns({ page, perPage, status })));
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    const input = validateCampaignSendInput({ ...body, messageBody: body.messageBody || '' });
    const c = await campaigns.createCampaign({ ...body, ...input, createdBy: auth.adminId, contactListId: input.contactListId, contactListIds: input.contactListIds });
    await createAuditLog({ adminId: auth.adminId, action: 'campaign_created', resourceType: 'campaign', resourceId: c.id, details: { name: c.name } });
    return new Response(JSON.stringify(c));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
