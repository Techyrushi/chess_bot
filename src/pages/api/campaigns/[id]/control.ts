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
    let message = 'Action completed';
    switch (action) {
      case 'start': {
        const c = await campaigns.getCampaign(id || '');
        const batchSize = Math.max(1, Number(body.batchSize || c?.batch_size || 100));
        if (c && c.status === 'draft') {
          const selectedListIds = Array.isArray(c.contact_list_ids) && c.contact_list_ids.length
            ? c.contact_list_ids
            : c.contact_list_id ? [c.contact_list_id] : [];
          const uniqueContacts = new Map<string, any>();
          for (const listId of selectedListIds) {
            const contacts = await contactService.getContactsInList(listId);
            for (const contact of contacts) {
              uniqueContacts.set(contact.id, contact);
            }
          }
          await campaigns.queueCampaignMessages(id || '', Array.from(uniqueContacts.values()));
        }
        result = await sender.startCampaign(id || '', batchSize);
        message = result ? `Campaign started in batches of ${batchSize}.` : 'Campaign could not be started.';
        break;
      }
      case 'pause':
        result = await sender.pauseCampaign(id || '');
        message = result ? 'Campaign paused.' : 'Campaign could not be paused.';
        break;
      case 'resume':
        result = await sender.resumeCampaign(id || '');
        message = result ? 'Campaign resumed.' : 'Campaign could not be resumed.';
        break;
      case 'cancel':
        result = await sender.cancelCampaign(id || '');
        message = result ? 'Campaign cancelled.' : 'Campaign could not be cancelled.';
        break;
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

    await createAuditLog({ adminId: auth.adminId, action: `campaign_${action}`, resourceType: 'campaign', resourceId: id });
    return new Response(JSON.stringify({ success: result, message }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
