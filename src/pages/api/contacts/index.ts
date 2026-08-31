export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as contacts from '@services/contacts';
import { createAuditLog } from '@lib/audit';

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = parseInt(url.searchParams.get('perPage') || '50', 10);
  const search = url.searchParams.get('search') || undefined;
  const optedOut = url.searchParams.get('optedOut');
  const listId = url.searchParams.get('listId');

  const result = await contacts.listContacts({
    page, perPage, search,
    optedOut: optedOut ? optedOut === 'true' : undefined,
    listId: listId ? listId : undefined
  });
  return new Response(JSON.stringify(result));
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    const r = await contacts.createContact(body);
    if (r.error) return new Response(JSON.stringify({ error: r.error }), { status: 400 });
    if (r.contact) {
      await createAuditLog({ adminId: auth.adminId, action: 'contact_created', resourceType: 'contact', resourceId: r.contact.id });
    }
    return new Response(JSON.stringify(r));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Invalid JSON' }), { status: 400 });
  }
};
