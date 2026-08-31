import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as templates from '@services/templates';
import { createAuditLog } from '@lib/audit';

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  return new Response(JSON.stringify(await templates.listTemplates()));
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    const t = await templates.createTemplate(body);
    await createAuditLog({ adminId: auth.adminId, action: 'template_created', resourceType: 'template', resourceId: t.id });
    return new Response(JSON.stringify(t));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
