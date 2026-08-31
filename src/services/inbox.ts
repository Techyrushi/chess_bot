import { getDb, mapDoc } from '@db/index';
import { normalizePhone } from '@lib/validation';
import { optOutContact, getContactByPhone, createContact } from './contacts';
import { ObjectId } from 'mongodb';

export interface IncomingMessage {
  id: string;
  sid: string | null;
  from_phone: string;
  to_phone: string;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  is_status_report: number;
  num_media: number | null;
  profile_name: string | null;
  wa_id: string | null;
  contact_id: string | null;
  is_read: number;
  received_at: number;
  contact_name?: string;
}

export async function storeIncomingMessage(data: {
  sid?: string;
  from: string;
  to: string;
  body?: string;
  numMedia?: number;
  mediaUrl?: string;
  mediaType?: string;
  profileName?: string;
  waId?: string;
}): Promise<IncomingMessage> {
  const db = getDb();
  const fromPhone = normalizePhone(data.from);
  const toPhone = normalizePhone(data.to);

  let contact = await getContactByPhone(fromPhone);
  if (!contact && fromPhone) {
    const r = await createContact({ phone: fromPhone, name: data.profileName });
    contact = r.contact;
  }

  const body = (data.body || '').trim();

  if (body && /^(STOP|CANCEL|UNSUBSCRIBE|QUIT|OPT\s*OUT)$/i.test(body.trim())) {
    await optOutContact(fromPhone, body, 'INBOUND_STOP');
  }

  const now = Date.now();
  const result = await db.collection('incoming_messages').insertOne({
    sid: data.sid || null,
    from_phone: fromPhone,
    to_phone: toPhone,
    body: body || null,
    media_url: data.mediaUrl || null,
    media_type: data.mediaType || null,
    is_status_report: 0,
    num_media: data.numMedia || 0,
    profile_name: data.profileName || null,
    wa_id: data.waId || null,
    contact_id: contact?.id || null,
    is_read: 0,
    received_at: now
  });

  const msg = await db.collection('incoming_messages').findOne({ _id: result.insertedId });
  return mapDoc<IncomingMessage>(msg)!;
}

export async function listInbox(opts?: {
  page?: number; perPage?: number; search?: string; unreadOnly?: boolean
}): Promise<{ messages: IncomingMessage[]; total: number; pages: number; hasNext: boolean; hasPrev: boolean }> {
  const db = getDb();
  const page = opts?.page || 1;
  const perPage = opts?.perPage || 50;

  const filter: any = { is_status_report: 0 };

  if (opts?.search) {
    const searchRegex = new RegExp(opts.search, 'i');
    filter.$or = [
      { from_phone: searchRegex },
      { body: searchRegex },
      { profile_name: searchRegex }
    ];
  }
  if (opts?.unreadOnly) {
    filter.is_read = 0;
  }

  const total = await db.collection('incoming_messages').countDocuments(filter);
  const pages = Math.ceil(total / perPage) || 1;
  const safePage = Math.min(Math.max(1, page), pages);
  const offset = (safePage - 1) * perPage;

  const rawMsgs = await db.collection('incoming_messages')
    .find(filter)
    .sort({ received_at: -1 })
    .skip(offset)
    .limit(perPage)
    .toArray();

  const messages: IncomingMessage[] = [];
  for (const raw of rawMsgs) {
    const mapped = mapDoc<IncomingMessage>(raw)!;
    if (mapped.contact_id) {
      try {
        const contact = await db.collection('contacts').findOne({ _id: new ObjectId(mapped.contact_id) });
        if (contact) {
          mapped.contact_name = contact.name;
        }
      } catch (e) {}
    }
    messages.push(mapped);
  }

  return {
    messages, total, pages,
    hasNext: safePage < pages,
    hasPrev: safePage > 1
  };
}

export async function markInboxAsRead(id: string): Promise<boolean> {
  const db = getDb();
  try {
    const r = await db.collection('incoming_messages').updateOne(
      { _id: new ObjectId(id) },
      { $set: { is_read: 1 } }
    );
    return (r.modifiedCount || 0) > 0;
  } catch (e) {
    return false;
  }
}

export async function markAllInboxAsRead(): Promise<number> {
  const db = getDb();
  const r = await db.collection('incoming_messages').updateMany(
    { is_read: 0, is_status_report: 0 },
    { $set: { is_read: 1 } }
  );
  return r.modifiedCount || 0;
}

export async function getConversation(phone: string): Promise<IncomingMessage[]> {
  const db = getDb();
  const norm = normalizePhone(phone);

  const rawMsgs = await db.collection('incoming_messages')
    .find({
      $or: [
        { from_phone: norm },
        { to_phone: norm }
      ]
    })
    .sort({ received_at: 1 })
    .toArray();

  const messages: IncomingMessage[] = [];
  for (const raw of rawMsgs) {
    const mapped = mapDoc<IncomingMessage>(raw)!;
    if (mapped.contact_id) {
      try {
        const contact = await db.collection('contacts').findOne({ _id: new ObjectId(mapped.contact_id) });
        if (contact) {
          mapped.contact_name = contact.name;
        }
      } catch (e) {}
    }
    messages.push(mapped);
  }

  return messages;
}
