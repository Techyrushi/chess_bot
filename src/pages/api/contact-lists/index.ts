import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as contacts from '@services/contacts';
import { createAuditLog } from '@lib/audit';

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  return new Response(JSON.stringify(await contacts.listContactLists()));
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) return new Response(JSON.stringify({ error: 'Name required' }), { status: 400 });
    const id = await contacts.createList(name, body.description);
    await createAuditLog({ adminId: auth.adminId, action: 'list_created', resourceType: 'contact_list', resourceId: id, details: { name } });
    return new Response(JSON.stringify({ id, success: true }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
