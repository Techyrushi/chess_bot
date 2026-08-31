import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as contacts from '@services/contacts';

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const listId = params.id || '';
  try {
    const body = await request.json();
    const contactIds: string[] = Array.isArray(body.contactIds) ? body.contactIds.map((x: any) => String(x)).filter(Boolean) : [];
    const n = await contacts.addContactsToList(listId, contactIds);
    return new Response(JSON.stringify({ success: true, added: n }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
