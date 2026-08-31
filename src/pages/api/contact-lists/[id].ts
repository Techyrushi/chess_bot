import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as contacts from '@services/contacts';

export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  const ok = await contacts.deleteList(id || '');
  return new Response(JSON.stringify({ success: ok }));
};

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  const listContacts = await contacts.getContactsInList(id || '');
  return new Response(JSON.stringify({ contacts: listContacts, count: listContacts.length }));
};
