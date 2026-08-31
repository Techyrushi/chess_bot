import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as inbox from '@services/inbox';

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  await inbox.markInboxAsRead(id || '');
  const messages = await inbox.listInbox({ page: 1, perPage: 1 });
  const msg = messages.messages[0];
  return new Response(JSON.stringify(msg || { error: 'Not found' }));
};

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  await inbox.markInboxAsRead(id || '');
  return new Response(JSON.stringify({ success: true }));
};
