import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as campaigns from '@services/campaigns';
import { createAuditLog } from '@lib/audit';
import { validateCampaignSendInput } from '@lib/validation';

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  const c = await campaigns.getCampaign(id || '');
  if (!c) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(JSON.stringify(c));
};

export const PUT: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  try {
    const body = await request.json();
    const normalized = validateCampaignSendInput({ ...body, messageBody: body.messageBody || '' });
    const c = await campaigns.updateCampaign(id || '', { ...body, ...normalized, contactListId: normalized.contactListId, contactListIds: normalized.contactListIds });
    if (!c) return new Response(JSON.stringify({ error: 'Cannot update' }), { status: 400 });
    await createAuditLog({ adminId: auth.adminId, action: 'campaign_updated', resourceType: 'campaign', resourceId: id });
    return new Response(JSON.stringify(c));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  const ok = await campaigns.deleteCampaign(id || '');
  if (!ok) return new Response(JSON.stringify({ error: 'Cannot delete' }), { status: 400 });
  await createAuditLog({ adminId: auth.adminId, action: 'campaign_deleted', resourceType: 'campaign', resourceId: id });
  return new Response(JSON.stringify({ success: true }));
};
