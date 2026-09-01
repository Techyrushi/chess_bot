import type { Contact } from './contacts';
import { getDb, mapDoc, parseObjectId } from '@db/index';
import { ObjectId } from 'mongodb';

export function renderTemplate(body: string, contact: Contact): string {
  if (!body) return '';
  let result = body;
  const customFields: Record<string, string> = contact.custom_fields
    ? JSON.parse(contact.custom_fields)
    : {};

  result = result.replace(/\{\{\s*name\s*\}\}/gi, contact.name || '');
  result = result.replace(/\{\{\s*first_name\s*\}\}/gi, (contact.name || '').split(' ')[0] || '');
  result = result.replace(/\{\{\s*company\s*\}\}/gi, contact.company || '');
  result = result.replace(/\{\{\s*city\s*\}\}/gi, contact.city || '');
  result = result.replace(/\{\{\s*email\s*\}\}/gi, contact.email || '');
  result = result.replace(/\{\{\s*phone\s*\}\}/gi, contact.phone || '');

  for (const [key, val] of Object.entries(customFields)) {
    const regex = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'gi');
    result = result.replace(regex, String(val || ''));
  }

  result = result.replace(/\{\{\s*\w+\s*\}\}/g, '');

  return result;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractVariables(body: string): string[] {
  if (!body) return [];
  const regex = /\{\{\s*([\w]+)\s*\}\}/g;
  const vars = new Set<string>();
  let m;
  while ((m = regex.exec(body)) !== null) {
    vars.add(m[1].toLowerCase());
  }
  return Array.from(vars);
}

export interface Campaign {
  id: string;
  name: string;
  contact_list_id: string | null;
  contact_list_ids?: string[];
  template_id: string | null;
  template_sid?: string;
  template_variables?: string;
  message_body: string;
  media_url: string | null;
  media_type: string | null;
  batch_size?: number | null;
  use_template: number;
  status: string;
  total_contacts: number;
  queued_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  undelivered_count: number;
  send_delay_min: number | null;
  send_delay_max: number | null;
  max_retries: number | null;
  scheduled_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  paused_at: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
  list_name?: string;
}

export interface CreateCampaignInput {
  name: string;
  contactListId?: string;
  contactListIds?: string[];
  templateId?: string;
  templateSid?: string;
  messageBody: string;
  mediaUrl?: string;
  mediaType?: string;
  useTemplate?: boolean;
  sendDelayMin?: number;
  sendDelayMax?: number;
  maxRetries?: number;
  scheduledAt?: number;
  createdBy: string;
}

function normalizeContactListIds(input?: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : input ? [input] : [];
  return [...new Set(raw.map(v => String(v || '').trim()).filter(Boolean))];
}

async function resolveValidListIds(input?: string | string[]): Promise<string[]> {
  const ids = normalizeContactListIds(input);
  if (!ids.length) return [];

  const db = getDb();
  const docs = await db.collection('contact_lists')
    .find({ _id: { $in: ids } }, { projection: { _id: 1 } })
    .toArray();

  const valid = docs.map(doc => String(doc._id));
  return [...new Set(valid)];
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const db = getDb();
  const now = Date.now();
  const listIds = await resolveValidListIds(input.contactListIds || input.contactListId);
  const listId = listIds[0] || null;
  let totalContacts = 0;

  let template: any = null;
  if (input.templateId) {
    const templateObjectId = parseObjectId(input.templateId);
    if (templateObjectId) template = await db.collection('templates').findOne({ _id: templateObjectId });
  }

  let templateSid = input.templateSid || template?.sid || null;
  const templateBody = (input.messageBody && input.messageBody.trim()) || template?.body || '';

  if (listIds.length) {
    const memberships = await db.collection('contact_list_members').find({ list_id: { $in: listIds } }).toArray();
    const contactIds = memberships
      .map(m => parseObjectId(m.contact_id))
      .filter((id): id is ObjectId => id !== null);

    if (contactIds.length > 0) {
      const uniqueContactIds = await db.collection('contacts').distinct('_id', {
        _id: { $in: contactIds },
        opted_out: 0
      });
      totalContacts = uniqueContactIds.length;
    }
  }

  const result = await db.collection('campaigns').insertOne({
    name: input.name.trim(),
    contact_list_id: listId,
    contact_list_ids: listIds,
    template_id: input.templateId || null,
    template_sid: templateSid,
    message_body: templateBody,
    media_url: input.mediaUrl || null,
    media_type: input.mediaType || null,
    batch_size: 100,
    use_template: input.useTemplate ? 1 : 0,
    status: 'draft',
    total_contacts: totalContacts,
    queued_count: 0,
    sent_count: 0,
    delivered_count: 0,
    read_count: 0,
    failed_count: 0,
    undelivered_count: 0,
    send_delay_min: input.sendDelayMin || 1000,
    send_delay_max: input.sendDelayMax || 3000,
    max_retries: input.maxRetries || 3,
    scheduled_at: input.scheduledAt || null,
    created_by: input.createdBy,
    created_at: now,
    updated_at: now
  });

  const campaignIdStr = result.insertedId.toString();

  await db.collection('campaign_sender_state').updateOne(
    { _id: campaignIdStr as any },
    {
      $set: {
        current_index: 0,
        is_running: 0
      }
    },
    { upsert: true }
  );

  return (await getCampaign(campaignIdStr))!;
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const db = getDb();
  const objectId = parseObjectId(id);
  if (!objectId) return null;
  try {
    const row = await db.collection('campaigns').findOne({ _id: objectId });
    if (!row) return null;
    const campaign = mapDoc<Campaign>(row)!;

    const listIds = Array.isArray(campaign.contact_list_ids) && campaign.contact_list_ids.length
      ? campaign.contact_list_ids
      : campaign.contact_list_id ? [campaign.contact_list_id] : [];

    if (listIds.length) {
      try {
        const validObjectIds = listIds.map(id => parseObjectId(id)).filter((id): id is ObjectId => id !== null);
        if (validObjectIds.length) {
          const lists = await db.collection('contact_lists').find({ _id: { $in: validObjectIds } }).toArray();
          if (lists.length) {
            campaign.list_name = lists.map(l => l.name).join(', ');
          }
        }
      } catch (e) {}
    }

    return campaign;
  } catch (e) {
    return null;
  }
}

export async function listCampaigns(opts: { page?: number; perPage?: number; status?: string }): Promise<{
  campaigns: Campaign[]; total: number; pages: number; hasNext: boolean; hasPrev: boolean
}> {
  const db = getDb();
  const page = opts.page || 1;
  const perPage = opts.perPage || 20;

  const filter: any = {};
  if (opts.status) {
    filter.status = opts.status;
  }

  const total = await db.collection('campaigns').countDocuments(filter);
  const pages = Math.ceil(total / perPage) || 1;
  const safePage = Math.min(Math.max(1, page), pages);
  const offset = (safePage - 1) * perPage;

  const rows = await db.collection('campaigns')
    .find(filter)
    .sort({ created_at: -1 })
    .skip(offset)
    .limit(perPage)
    .toArray();

  const campaigns: Campaign[] = [];
  for (const row of rows) {
    const campaign = mapDoc<Campaign>(row)!;
    const listIds = Array.isArray(campaign.contact_list_ids) && campaign.contact_list_ids.length
      ? campaign.contact_list_ids
      : campaign.contact_list_id ? [campaign.contact_list_id] : [];
    if (listIds.length) {
      try {
        const validObjectIds = listIds.map(id => parseObjectId(id)).filter((id): id is ObjectId => id !== null);
        if (validObjectIds.length) {
          const lists = await db.collection('contact_lists').find({ _id: { $in: validObjectIds } }).toArray();
          if (lists.length) {
            campaign.list_name = lists.map(l => l.name).join(', ');
          }
        }
      } catch (e) {}
    }
    campaigns.push(campaign);
  }

  return {
    campaigns, total, pages,
    hasNext: safePage < pages,
    hasPrev: safePage > 1
  };
}

export async function updateCampaign(id: string, updates: Partial<CreateCampaignInput>): Promise<Campaign | null> {
  const db = getDb();
  const existing = await getCampaign(id || '');
  if (!existing) return null;
  if (existing.status !== 'draft' && existing.status !== 'paused') return existing;

  const updateFields: any = {};

  const normalizedListIds = await resolveValidListIds((updates.contactListIds || updates.contactListId) as any);
  if (updates.contactListId !== undefined || updates.contactListIds !== undefined) {
    updateFields.contact_list_id = normalizedListIds[0] || null;
    updateFields.contact_list_ids = normalizedListIds;
  }

  const fields: [keyof CreateCampaignInput, (v: any) => any][] = [
    ['name', v => v?.trim()],
    ['contactListId', v => v || null],
    ['templateId', v => v || null],
    ['templateSid', v => v || null],
    ['messageBody', v => v],
    ['mediaUrl', v => v || null],
    ['mediaType', v => v || null],
    ['useTemplate', v => v ? 1 : 0],
    ['sendDelayMin', v => v],
    ['sendDelayMax', v => v],
    ['maxRetries', v => v],
    ['scheduledAt', v => v || null]
  ];

  for (const [key, transform] of fields) {
    if ((updates as any)[key] !== undefined) {
      const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      updateFields[col] = transform((updates as any)[key]);
    }
  }

  if (updates.templateId !== undefined || updates.templateSid !== undefined) {
    const resolvedTemplateId = updates.templateId ?? existing.template_id ?? null;
    const templateObjectId = resolvedTemplateId ? parseObjectId(resolvedTemplateId) : null;
    const template = templateObjectId ? await db.collection('templates').findOne({ _id: templateObjectId }) : null;
    updateFields.template_sid = updates.templateSid || template?.sid || null;
    if ((updates.messageBody === undefined || !String(updates.messageBody || '').trim()) && template?.body) {
      updateFields.message_body = template.body;
    }
  }

  if (updates.messageBody !== undefined && String(updates.messageBody || '').trim()) {
    updateFields.message_body = updates.messageBody;
  }

  if (updates.contactListId !== undefined || updates.contactListIds !== undefined) {
    const listIds = await resolveValidListIds((updates.contactListIds || updates.contactListId) as any);
    let totalContacts = 0;
    if (listIds.length) {
      const memberships = await db.collection('contact_list_members').find({ list_id: { $in: listIds } }).toArray();
      const contactIds = memberships
        .map(m => parseObjectId(m.contact_id))
        .filter((id): id is ObjectId => id !== null);

      if (contactIds.length > 0) {
        const uniqueContactIds = await db.collection('contacts').distinct('_id', {
          _id: { $in: contactIds },
          opted_out: 0
        });
        totalContacts = uniqueContactIds.length;
      }
    }
    updateFields.total_contacts = totalContacts;
  }

  if (Object.keys(updateFields).length > 0) {
    updateFields.updated_at = Date.now();
    await db.collection('campaigns').updateOne({ _id: objectId }, { $set: updateFields });
  }

  return await getCampaign(id || '');
}

export async function transitionCampaignStatus(id: string, newStatus: string): Promise<Campaign | null> {
  const db = getDb();
  const objectId = parseObjectId(id);
  if (!objectId) return null;
  const now = Date.now();
  const validTransitions: Record<string, string[]> = {
    'draft': ['queued', 'cancelled'],
    'queued': ['sending', 'cancelled', 'paused'],
    'sending': ['paused', 'completed', 'cancelled', 'failed'],
    'paused': ['sending', 'cancelled'],
    'cancelled': [],
    'completed': [],
    'failed': []
  };
  
  const campaign = await getCampaign(id || '');
  if (!campaign) return null;
  const allowed = validTransitions[campaign.status] || [];
  if (!allowed.includes(newStatus) && newStatus !== campaign.status) {
    return null;
  }

  const updateFields: any = {
    status: newStatus,
    updated_at: now
  };

  if (newStatus === 'sending' && !campaign.started_at) {
    updateFields.started_at = now;
  }
  if (newStatus === 'paused') {
    updateFields.paused_at = now;
  }
  if (newStatus === 'completed' || newStatus === 'cancelled' || newStatus === 'failed') {
    updateFields.completed_at = now;
  }

  await db.collection('campaigns').updateOne({ _id: objectId }, { $set: updateFields });
  return await getCampaign(id || '');
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const db = getDb();
  const objectId = parseObjectId(id);
  if (!objectId) return false;
  try {
    const c = await getCampaign(id || '');
    if (!c) return false;
    if (c.status === 'sending') return false;
    const result = await db.collection('campaigns').deleteOne({ _id: objectId });
    // Also delete references in state
    await db.collection('campaign_sender_state').deleteOne({ _id: id as any });
    return (result.deletedCount || 0) > 0;
  } catch (e) {
    return false;
  }
}

export interface MessageRecord {
  id: string;
  sid: string | null;
  campaign_id: string | null;
  contact_id: string;
  phone: string;
  body: string;
  media_url: string | null;
  media_type: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  price_amount: number | null;
  price_currency: string | null;
  queued_at: number | null;
  pending_at: number | null;
  pending_timestamp: string | null;
  sent_at: number | null;
  sent_timestamp: string | null;
  delivered_at: number | null;
  read_at: number | null;
  failed_at: number | null;
  failed_timestamp: string | null;
  undelivered_at: number | null;
  created_at: number;
}

export async function queueCampaignMessages(campaignId: string, contacts: Contact[]): Promise<number> {
  if (!contacts.length) return 0;
  const db = getDb();
  const campaign = await getCampaign(campaignId);
  if (!campaign) return 0;

  const now = Date.now();
  const messagesToInsert = contacts.map(c => {
    const renderedBody = renderTemplate(campaign.message_body || '', c);
    return {
      campaign_id: campaignId,
      contact_id: c.id,
      phone: c.phone,
      body: renderedBody,
      media_url: campaign.media_url,
      media_type: campaign.media_type,
      status: 'queued',
      retry_count: 0,
      queued_at: now,
      created_at: now,
      updated_at: now
    };
  });

  await db.collection('messages').insertMany(messagesToInsert);

  const safeCampaignObjectId = parseObjectId(campaignId);
  if (safeCampaignObjectId) {
    await db.collection('campaigns').updateOne(
      { _id: safeCampaignObjectId },
      {
        $set: {
          queued_count: contacts.length,
          total_contacts: contacts.length,
          updated_at: now
        }
      }
    );
  }

  return contacts.length;
}

export async function listCampaignMessages(campaignId: string, opts?: {
  page?: number; perPage?: number; status?: string
}): Promise<{ messages: MessageRecord[]; total: number; pages: number }> {
  const db = getDb();
  const page = opts?.page || 1;
  const perPage = opts?.perPage || 50;
  
  const filter: any = { campaign_id: campaignId };
  if (opts?.status) {
    filter.status = opts.status;
  }

  const total = await db.collection('messages').countDocuments(filter);
  const pages = Math.ceil(total / perPage) || 1;
  const offset = (Math.min(Math.max(1, page), pages) - 1) * perPage;

  const rows = await db.collection('messages')
    .find(filter)
    .sort({ created_at: -1 })
    .skip(offset)
    .limit(perPage)
    .toArray();

  const messages = rows.map(r => mapDoc<MessageRecord>(r)!) as MessageRecord[];
  return { messages, total, pages };
}

export async function getDashboardStats(): Promise<{
  totalCampaigns: number;
  totalContacts: number;
  activeCampaigns: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  optOuts: number;
  unreadMessages: number;
  campaigns: Campaign[];
  recentIncoming: any[];
}> {
  const db = getDb();

  const totalCampaigns = await db.collection('campaigns').countDocuments();
  const totalContacts = await db.collection('contacts').countDocuments({ opted_out: 0 });
  const activeCampaigns = await db.collection('campaigns').countDocuments({
    status: { $in: ['queued', 'sending', 'paused'] }
  });

  const allCampaigns = await db.collection('campaigns').find({}).toArray();
  const totalSent = allCampaigns.reduce((acc, c) => acc + (c.sent_count || 0), 0);
  const totalDelivered = allCampaigns.reduce((acc, c) => acc + (c.delivered_count || 0), 0);
  const totalRead = allCampaigns.reduce((acc, c) => acc + (c.read_count || 0), 0);
  const totalFailed = allCampaigns.reduce((acc, c) => acc + (c.failed_count || 0) + (c.undelivered_count || 0), 0);

  const optOuts = await db.collection('opt_outs').countDocuments();
  const unreadMessages = await db.collection('incoming_messages').countDocuments({
    is_read: 0,
    is_status_report: 0
  });

  const recentCampaignsRaw = await db.collection('campaigns')
    .find({})
    .sort({ created_at: -1 })
    .limit(5)
    .toArray();

  const campaigns: Campaign[] = [];
  for (const row of recentCampaignsRaw) {
    const campaign = mapDoc<Campaign>(row)!;
    if (campaign.contact_list_id) {
      const validListId = parseObjectId(campaign.contact_list_id);
      if (validListId) {
        try {
          const list = await db.collection('contact_lists').findOne({ _id: validListId });
          if (list) {
            campaign.list_name = list.name;
          }
        } catch (e) {}
      }
    }
    campaigns.push(campaign);
  }

  const recentIncomingRaw = await db.collection('incoming_messages')
    .find({ is_status_report: 0 })
    .sort({ received_at: -1 })
    .limit(10)
    .toArray();

  const recentIncoming = [];
  for (const doc of recentIncomingRaw) {
    const mapped = mapDoc<any>(doc)!;
    if (mapped.contact_id) {
      const validContactId = parseObjectId(mapped.contact_id);
      if (validContactId) {
        try {
          const contact = await db.collection('contacts').findOne({ _id: validContactId });
          if (contact) {
            mapped.contact_name = contact.name;
          }
        } catch (e) {}
      }
    }
    recentIncoming.push(mapped);
  }

  return {
    totalCampaigns, totalContacts, activeCampaigns,
    totalSent, totalDelivered, totalRead, totalFailed,
    optOuts, unreadMessages, campaigns, recentIncoming
  };
}

export async function getCampaignAnalytics(campaignId: string): Promise<{
  sent: number; delivered: number; read: number;
  failed: number; undelivered: number; queued: number;
  deliveryRate: number; readRate: number; failureRate: number;
}> {
  const db = getDb();
  
  const sent = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'sent' });
  const delivered = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'delivered' });
  const read = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'read' });
  const failed = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'failed' });
  const undelivered = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'undelivered' });
  const queued = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'queued' });

  const total = sent + delivered + read + failed + undelivered + queued;

  return {
    sent, delivered, read, failed, undelivered, queued,
    deliveryRate: total > 0 ? Math.round((delivered + read) / (total - queued) * 1000) / 10 : 0,
    readRate: total > 0 ? Math.round(read / (total - queued) * 1000) / 10 : 0,
    failureRate: total > 0 ? Math.round((failed + undelivered) / (total - queued) * 1000) / 10 : 0
  };
}
