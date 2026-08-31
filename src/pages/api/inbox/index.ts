import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as inbox from '@services/inbox';
import { createAuditLog } from '@lib/audit';
import * as twilio from '@services/twilio';

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = parseInt(url.searchParams.get('perPage') || '50', 10);
  const search = url.searchParams.get('search') || undefined;
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  return new Response(JSON.stringify(await inbox.listInbox({ page, perPage, search, unreadOnly })));
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    if (body.action === 'markAllRead') {
      const n = await inbox.markAllInboxAsRead();
      return new Response(JSON.stringify({ success: true, marked: n }));
    }
    if (body.action === 'reply' && body.phone && body.body) {
      const r = await twilio.sendWhatsAppMessage({
        to: body.phone,
        body: String(body.body),
        mediaUrl: body.mediaUrl
      });
      await createAuditLog({ adminId: auth.adminId, action: 'reply_sent', details: { to: body.phone, sid: r.sid } });
      return new Response(JSON.stringify(r));
    }
    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
