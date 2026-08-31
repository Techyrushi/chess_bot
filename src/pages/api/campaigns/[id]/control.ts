import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as sender from '@services/sender';
import * as campaigns from '@services/campaigns';
import * as contactService from '@services/contacts';
import { createAuditLog } from '@lib/audit';

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  try {
    const body = await request.json();
    const action = String(body.action || '');

    let result = false;
    switch (action) {
      case 'start': {
        const c = await campaigns.getCampaign(id || '');
        if (c && c.status === 'draft' && c.contact_list_id) {
          const contacts = await contactService.getContactsInList(c.contact_list_id);
          await campaigns.queueCampaignMessages(id || '', contacts);
        }
        result = await sender.startCampaign(id || '');
        break;
      }
      case 'pause':
        result = await sender.pauseCampaign(id || '');
        break;
      case 'resume':
        result = await sender.resumeCampaign(id || '');
        break;
      case 'cancel':
        result = await sender.cancelCampaign(id || '');
        break;
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

    await createAuditLog({ adminId: auth.adminId, action: `campaign_${action}`, resourceType: 'campaign', resourceId: id });
    return new Response(JSON.stringify({ success: result }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
