import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import { isConfigured as isTwilioConfigured } from '@services/twilio';
import { getCampaign } from '@services/campaigns';
import { getDb } from '@db/index';

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  try {
    const body = await request.json();
    const campaignId = body.campaignId as string;

    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'No campaignId provided' }), { status: 400 });
    }

    const db = getDb();
    
    // Check Twilio configuration
    const twilioOk = await isTwilioConfigured();
    console.log('Twilio configured:', twilioOk);

    // Get campaign details
    const campaign = await getCampaign(campaignId);
    console.log('Campaign:', campaign);

    if (!campaign) {
      return new Response(JSON.stringify({ 
        error: 'Campaign not found',
        campaignId 
      }), { status: 404 });
    }

    // Check contact list
    const contactListId = campaign.contact_list_id;
    console.log('Contact list ID:', contactListId);

    let contactsInList = 0;
    if (contactListId) {
      const list = await db.collection('contact_lists').findOne({ _id: { $oid: contactListId } });
      console.log('Contact list found:', !!list);
      
      const contacts = await db.collection('contacts')
        .countDocuments({ list_ids: { $in: [contactListId] } });
      contactsInList = contacts;
    }

    // Check queued messages
    const queuedMessages = await db.collection('messages').countDocuments({
      campaign_id: campaignId,
      status: 'queued'
    });
    console.log('Queued messages:', queuedMessages);

    // Check all messages
    const allMessages = await db.collection('messages').countDocuments({
      campaign_id: campaignId
    });
    console.log('All messages:', allMessages);

    // Check message statuses
    const messagesByStatus = await db.collection('messages').aggregate([
      { $match: { campaign_id: campaignId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();
    console.log('Messages by status:', messagesByStatus);

    const diagnostics = {
      campaignId,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        contact_list_id: campaign.contact_list_id,
        message_body: campaign.message_body?.substring(0, 50)
      },
      twilio: {
        configured: twilioOk
      },
      contacts: {
        inList: contactsInList
      },
      messages: {
        queued: queuedMessages,
        total: allMessages,
        byStatus: messagesByStatus
      },
      issues: [] as string[]
    };

    // Identify issues
    if (!twilioOk) {
      (diagnostics.issues as string[]).push('Twilio not configured - check environment variables');
    }
    if (!campaign.contact_list_id) {
      (diagnostics.issues as string[]).push('No contact list selected - cannot send messages');
    }
    if (campaign.contact_list_id && contactsInList === 0) {
      (diagnostics.issues as string[]).push('Contact list is empty - no contacts to send to');
    }
    if (campaign.status === 'draft' && queuedMessages === 0) {
      (diagnostics.issues as string[]).push('Campaign in draft status with no queued messages - run start action');
    }
    if (campaign.status !== 'sending' && campaign.status !== 'completed') {
      (diagnostics.issues as string[]).push(`Campaign status is ${campaign.status}, not actively sending`);
    }

    return new Response(JSON.stringify(diagnostics, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    console.error('Debug error:', e);
    return new Response(JSON.stringify({ 
      error: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
