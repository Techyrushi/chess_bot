import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import { optOutContact } from '@services/contacts';
import { createAuditLog } from '@lib/audit';
import { normalizePhone, isValidPhone } from '@lib/validation';

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    const phone = normalizePhone(String(body.phone || ''));
    if (!isValidPhone(phone)) return new Response(JSON.stringify({ error: 'Invalid phone' }), { status: 400 });
    const ok = await optOutContact(phone, body.reason, body.source || 'MANUAL');
    if (ok) {
      await createAuditLog({ adminId: auth.adminId, action: 'optout_created', details: { phone } });
    }
    return new Response(JSON.stringify({ success: ok }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
