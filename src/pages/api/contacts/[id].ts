import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as contacts from '@services/contacts';
import { createAuditLog } from '@lib/audit';

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  const c = await contacts.getContact(id || '');
  if (!c) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(JSON.stringify(c));
};

export const PUT: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  try {
    const body = await request.json();
    const c = await contacts.updateContact(id || '', body);
    if (!c) return new Response(JSON.stringify({ error: 'Not found or invalid' }), { status: 400 });
    await createAuditLog({ adminId: auth.adminId, action: 'contact_updated', resourceType: 'contact', resourceId: id });
    return new Response(JSON.stringify(c));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  const ok = await contacts.deleteContact(id || '');
  if (!ok) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  await createAuditLog({ adminId: auth.adminId, action: 'contact_deleted', resourceType: 'contact', resourceId: id });
  return new Response(JSON.stringify({ success: true }));
};
