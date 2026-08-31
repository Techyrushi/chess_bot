import { getDb } from '@db/index';
import { verifyTwilioSignature, generateWebhookIdempotencyKey } from '@lib/crypto';
import { getTwilioSettings } from '@lib/settings';
import { storeIncomingMessage } from '@services/inbox';
import { optOutContact } from '@services/contacts';
import { ObjectId } from 'mongodb';

const processedKeys = new Map<string, number>();
const MAX_IDEMPOTENCY_ENTRIES = 10000;

async function isProcessed(key: string): Promise<boolean> {
  const existing = processedKeys.get(key);
  if (existing !== undefined) return true;
  const db = getDb();
  const r = await db.collection('messages').findOne({ sid: key.split(':')[0] });
  if (r) {
    if (r.created_at) {
      processedKeys.set(key, r.created_at);
      if (processedKeys.size > MAX_IDEMPOTENCY_ENTRIES) {
        const oldKeys = Array.from(processedKeys.entries())
          .sort((a, b) => a[1] - b[1])
          .slice(0, 1000)
          .map(e => e[0]);
        for (const k of oldKeys) processedKeys.delete(k);
      }
      return true;
    }
  }
  return false;
}

function markProcessed(key: string, ts: number): void {
  processedKeys.set(key, ts);
  if (processedKeys.size > MAX_IDEMPOTENCY_ENTRIES) {
    const oldKeys = Array.from(processedKeys.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, 1000)
      .map(e => e[0]);
    for (const k of oldKeys) processedKeys.delete(k);
  }
}

export async function handleStatusUpdate(params: Record<string, string>, signature?: string, url?: string): Promise<{ ok: boolean; statusCode: number; message: string }> {
  const settings = await getTwilioSettings();
  const sid = params.MessageSid || params.SmsSid || '';
  const rawStatus = params.MessageStatus || params.SmsStatus || '';
  const errorCode = params.ErrorCode || '';
  const errorMessage = params.ErrorMessage || '';
  const priceAmount = params.MessagePrice || params.Amount || undefined;
  const priceCurrency = params.MessagePriceCurrency || params.Currency || undefined;

  if (!sid) {
    return { ok: false, statusCode: 400, message: 'Missing MessageSid' };
  }

  if (settings.authToken && signature && url) {
    if (!verifyTwilioSignature(settings.authToken, url, params, signature)) {
      return { ok: false, statusCode: 403, message: 'Invalid signature' };
    }
  }

  const idemKey = generateWebhookIdempotencyKey(sid, rawStatus);
  if (await isProcessed(idemKey)) {
    return { ok: true, statusCode: 200, message: 'Already processed' };
  }

  const db = getDb();
  const msg = await db.collection('messages').findOne({ sid });
  if (!msg) {
    markProcessed(idemKey, Date.now());
    return { ok: true, statusCode: 200, message: 'Unknown message, accepted' };
  }

  const now = Date.now();
  const updateFields: any = {
    updated_at: now
  };

  const statusMap: Record<string, string> = {
    'queued': 'queued',
    'accepted': 'queued',
    'sending': 'queued',
    'sent': 'sent',
    'delivered': 'delivered',
    'read': 'read',
    'failed': 'failed',
    'undelivered': 'undelivered',
    'received': 'delivered'
  };
  const mappedStatus = statusMap[rawStatus] || rawStatus || msg.status;
  updateFields.status = mappedStatus;

  if (errorCode) updateFields.error_code = String(errorCode);
  if (errorMessage) updateFields.error_message = errorMessage;
  if (priceAmount !== undefined && priceAmount !== '') {
    updateFields.price_amount = parseFloat(String(priceAmount)) || null;
  }
  if (priceCurrency) updateFields.price_currency = priceCurrency;

  switch (mappedStatus) {
    case 'sent':
      if (!msg.sent_at) updateFields.sent_at = now;
      break;
    case 'delivered':
      if (!msg.delivered_at) updateFields.delivered_at = now;
      break;
    case 'read':
      if (!msg.read_at) updateFields.read_at = now;
      break;
    case 'failed':
      if (!msg.failed_at) updateFields.failed_at = now;
      break;
    case 'undelivered':
      if (!msg.undelivered_at) updateFields.undelivered_at = now;
      break;
  }

  await db.collection('messages').updateOne({ sid }, { $set: updateFields });

  if (msg.campaign_id) {
    const campaignId = msg.campaign_id;
    const q = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'queued' });
    const s = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'sent' });
    const d = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'delivered' });
    const r = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'read' });
    const f = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'failed' });
    const u = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'undelivered' });

    await db.collection('campaigns').updateOne(
      { _id: new ObjectId(campaignId) },
      {
        $set: {
          queued_count: q,
          sent_count: s,
          delivered_count: d,
          read_count: r,
          failed_count: f,
          undelivered_count: u,
          updated_at: now
        }
      }
    );
  }

  markProcessed(idemKey, now);
  return { ok: true, statusCode: 200, message: 'OK' };
}

export async function handleIncomingMessage(params: Record<string, string>, signature?: string, url?: string): Promise<{ ok: boolean; statusCode: number; message: string }> {
  const settings = await getTwilioSettings();
  const sid = params.MessageSid || '';
  const from = params.From || '';
  const to = params.To || '';
  const body = params.Body || '';
  const numMedia = parseInt(params.NumMedia || '0', 10) || 0;
  const profileName = params.ProfileName || '';
  const waId = params.WaId || '';
  let mediaUrl: string | undefined;
  let mediaType: string | undefined;
  if (numMedia > 0) {
    mediaUrl = params.MediaUrl0;
    mediaType = params.MediaContentType0;
  }

  if (!sid || !from || !to) {
    return { ok: false, statusCode: 400, message: 'Missing required fields' };
  }

  if (settings.authToken && signature && url) {
    if (!verifyTwilioSignature(settings.authToken, url, params, signature)) {
      return { ok: false, statusCode: 403, message: 'Invalid signature' };
    }
  }

  const idemKey = `incoming:${sid}`;
  if (await isProcessed(idemKey)) {
    return { ok: true, statusCode: 200, message: 'Already processed' };
  }

  const bodyTrim = body.trim();
  if (bodyTrim && /^(STOP|CANCEL|UNSUBSCRIBE|QUIT|END|OPT\s*OUT)$/i.test(bodyTrim)) {
    const phone = from.replace(/^whatsapp:/, '');
    await optOutContact(phone, bodyTrim, 'TWILIO_INBOUND');
  }

  try {
    await storeIncomingMessage({
      sid,
      from: from.replace(/^whatsapp:/, ''),
      to: to.replace(/^whatsapp:/, ''),
      body,
      numMedia,
      mediaUrl,
      mediaType,
      profileName,
      waId
    });
  } catch (e: any) {
    return { ok: false, statusCode: 500, message: e.message || 'DB error' };
  }

  markProcessed(idemKey, Date.now());
  return { ok: true, statusCode: 200, message: 'OK' };
}
