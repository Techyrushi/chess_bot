import { getDb, mapDoc, parseObjectId } from '@db/index';
import { sendWhatsAppMessage, sendWhatsAppTemplate, isConfigured, resolveTwilioStatusCallbackUrl } from './twilio';
import { getCampaign, transitionCampaignStatus, getCampaignAnalytics } from './campaigns';
import { isOptedOut } from './contacts';
import { getSendSettings, getTwilioSettings } from '@lib/settings';
import { ObjectId } from 'mongodb';

const runningCampaigns = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function updateCampaignCounts(campaignId: string): Promise<void> {
  const db = getDb();
  
  const q = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'queued' });
  const s = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'sent' });
  const d = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'delivered' });
  const r = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'read' });
  const f = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'failed' });
  const u = await db.collection('messages').countDocuments({ campaign_id: campaignId, status: 'undelivered' });

  const safeCampaignId = parseObjectId(campaignId);
  if (!safeCampaignId) return;

  await db.collection('campaigns').updateOne(
    { _id: safeCampaignId },
    {
      $set: {
        queued_count: q,
        sent_count: s,
        delivered_count: d,
        read_count: r,
        failed_count: f,
        undelivered_count: u,
        updated_at: Date.now()
      }
    }
  );
}

export async function runCampaignBatch(campaignId: string, batchSize: number = 50): Promise<{
  processed: number; errors: number; finished: boolean;
}> {
  const db = getDb();
  const campaign = await getCampaign(campaignId);
  const batchTimestamp = new Date().toISOString();
  
  if (!campaign) {
    console.log(`[${batchTimestamp}] [Campaign ${campaignId}] Campaign not found`);
    return { processed: 0, errors: 0, finished: true };
  }
  if (!(await isConfigured())) {
    console.log(`[${batchTimestamp}] [Campaign ${campaignId}] Twilio not configured`);
    return { processed: 0, errors: 0, finished: true };
  }

  if (campaign.status !== 'sending') return { processed: 0, errors: 0, finished: false };

  const globalSettings = await getSendSettings();
  const delayMin = campaign.send_delay_min ?? globalSettings.delayMin;
  const delayMax = campaign.send_delay_max ?? globalSettings.delayMax;
  const maxRetries = campaign.max_retries ?? globalSettings.maxRetries;

  const messagesRaw = await db.collection('messages')
    .find({ campaign_id: campaignId, status: 'queued' })
    .sort({ _id: 1 })
    .limit(batchSize)
    .toArray();

  const messages = messagesRaw.map(m => mapDoc<any>(m)!);

  if (!messages.length) {
    await updateCampaignCounts(campaignId);
    const a = await getCampaignAnalytics(campaignId);
    if (a.queued === 0) {
      const completedTimestamp = new Date().toISOString();
      console.log(`[${completedTimestamp}] [Campaign ${campaignId}] ✅ Campaign completed - All messages processed (Sent: ${a.sent}, Delivered: ${a.delivered}, Failed: ${a.failed})`);
      await transitionCampaignStatus(campaignId, 'completed');
    }
    return { processed: 0, errors: 0, finished: a.queued === 0 };
  }

  const batchStartTimestamp = new Date().toISOString();
  console.log(`[${batchStartTimestamp}] [Campaign ${campaignId}] Processing batch of ${messages.length} messages`);

  let processed = 0;
  let errors = 0;

  for (const msg of messages) {
    const freshCampaign = await getCampaign(campaignId);
    if (!freshCampaign || freshCampaign.status !== 'sending') {
      await updateCampaignCounts(campaignId);
      return { processed, errors, finished: false };
    }

    if (await isOptedOut(msg.phone)) {
      const optOutTimestamp = new Date().toISOString();
      console.log(`[${optOutTimestamp}] [Campaign ${campaignId}] ⏭️  Skipping opted-out number: ${msg.phone}`);
      const safeMessageId = parseObjectId(msg.id);
      if (safeMessageId) {
        await db.collection('messages').updateOne(
          { _id: safeMessageId },
          {
            $set: {
              status: 'failed',
              error_code: 'OPT_OUT',
              error_message: 'Contact opted out',
              failed_at: Date.now(),
              updated_at: Date.now()
            }
          }
        );
      }
      processed++;
      continue;
    }

    const statusCallback = resolveTwilioStatusCallbackUrl(process.env.APP_URL || process.env.PUBLIC_URL)
      ? `${resolveTwilioStatusCallbackUrl(process.env.APP_URL || process.env.PUBLIC_URL)}/api/webhooks/twilio/status`
      : undefined;

    // Get template from campaign or use default from settings
    const twilioSettings = await getTwilioSettings();
    const templateSid = campaign.template_sid || twilioSettings.defaultTemplateSid;

    if (!templateSid) {
      console.error(`[Campaign ${campaignId}] No WhatsApp template configured - cannot send`);
      const safeMessageId = parseObjectId(msg.id);
      if (safeMessageId) {
        await db.collection('messages').updateOne(
          { _id: safeMessageId },
          {
            $set: {
              status: 'failed',
              error_code: 'NO_TEMPLATE',
              error_message: 'WhatsApp template not configured',
              failed_at: Date.now(),
              updated_at: Date.now()
            }
          }
        );
      }
      processed++;
      continue;
    }

    // Send using approved template
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Campaign ${campaignId}] Sending message to ${msg.phone} using template ${templateSid}`);

    const result = await sendWhatsAppTemplate({
      to: msg.phone,
      templateSid,
      templateVariables: msg.template_variables ? JSON.parse(String(msg.template_variables)) : undefined,
      statusCallback
    });

    const now = Date.now();

    if (result.success) {
      const normalizedStatus = result.status ? (result.status === 'sent' || result.status === 'delivered' || result.status === 'read' ? 'sent' : 'pending') : 'pending';
      const eventTimestamp = new Date().toISOString();
      console.log(`[${eventTimestamp}] [Campaign ${campaignId}] 📣 Message status for ${msg.phone} | SID: ${result.sid} | Status: ${normalizedStatus}`);

      const update: Record<string, any> = {
        sid: result.sid ?? null,
        status: normalizedStatus,
        updated_at: now
      };

      if (normalizedStatus === 'sent') {
        update.sent_at = now;
        update.sent_timestamp = eventTimestamp;
      } else {
        update.pending_at = now;
        update.pending_timestamp = eventTimestamp;
      }

      const safeMessageId = parseObjectId(msg.id);
      if (safeMessageId) {
        await db.collection('messages').updateOne(
          { _id: safeMessageId },
          { $set: update }
        );
      }
      processed++;
    } else {
      const errorTimestamp = new Date().toISOString();
      const newRetry = msg.retry_count + 1;
      const isMaxRetriesExceeded = newRetry >= maxRetries;
      
      console.log(`[${errorTimestamp}] [Campaign ${campaignId}] ❌ Failed to send to ${msg.phone} | Error: ${result.errorMessage} | Retry: ${newRetry}/${maxRetries}`);

      if (newRetry < maxRetries) {
        // Retry on next batch
        const safeMessageId = parseObjectId(msg.id);
        if (safeMessageId) {
          await db.collection('messages').updateOne(
            { _id: safeMessageId },
            {
              $set: {
                retry_count: newRetry,
                error_code: String(result.errorCode || ''),
                error_message: result.errorMessage || '',
                last_error_timestamp: errorTimestamp,
                pending_at: now,
                pending_timestamp: errorTimestamp,
                status: 'pending',
                updated_at: now
              }
            }
          );
        }
        console.log(`[${errorTimestamp}] [Campaign ${campaignId}] ⏳ Message to ${msg.phone} marked PENDING for retry`);
      } else {
        // Max retries exceeded
        const safeMessageId = parseObjectId(msg.id);
        if (safeMessageId) {
          await db.collection('messages').updateOne(
            { _id: safeMessageId },
            {
              $set: {
                retry_count: newRetry,
                status: 'failed',
                error_code: String(result.errorCode || ''),
                error_message: result.errorMessage || '',
                failed_at: now,
                failed_timestamp: errorTimestamp,
                updated_at: now
              }
            }
          );
        }
        console.log(`[${errorTimestamp}] [Campaign ${campaignId}] ❌ Message to ${msg.phone} marked FAILED after ${maxRetries} retries`);
        errors++;
        processed++;
      }
    }

    await updateCampaignCounts(campaignId);

    const delay = randomDelay(delayMin, delayMax);
    await sleep(delay);
  }

  await updateCampaignCounts(campaignId);

  const remainingCount = await db.collection('messages').countDocuments({
    campaign_id: campaignId,
    status: 'queued'
  });

  if (remainingCount === 0) {
    await transitionCampaignStatus(campaignId, 'completed');
    return { processed, errors, finished: true };
  }

  return { processed, errors, finished: false };
}

export async function startCampaign(campaignId: string, batchSize: number = 100): Promise<boolean> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return false;

  const listIds = Array.isArray(campaign.contact_list_ids) && campaign.contact_list_ids.length
    ? campaign.contact_list_ids
    : campaign.contact_list_id ? [campaign.contact_list_id] : [];

  if (!listIds.length) return false;
  if (!(await isConfigured())) return false;

  const normalizedBatch = Math.max(1, Math.min(Number(batchSize) || 100, 10000));
  const db = getDb();
  const safeCampaignObjectId = parseObjectId(campaignId);
  if (safeCampaignObjectId) {
    await db.collection('campaigns').updateOne({ _id: safeCampaignObjectId }, { $set: { batch_size: normalizedBatch, updated_at: Date.now() } });
  }

  const transitioned = await transitionCampaignStatus(campaignId, 'sending');
  if (!transitioned) {
    const c = await transitionCampaignStatus(campaignId, 'queued');
    if (!c) return false;
    await transitionCampaignStatus(campaignId, 'sending');
  }

  if (!runningCampaigns.has(campaignId)) {
    runningCampaigns.add(campaignId);
    (async () => {
      try {
        let finished = false;
        while (!finished) {
          const fresh = await getCampaign(campaignId);
          if (!fresh || (fresh.status !== 'sending')) {
            break;
          }
          const batchSize = Number((await getCampaign(campaignId))?.batch_size ?? 100) || 100;
          const r = await runCampaignBatch(campaignId, batchSize);
          finished = r.finished;
        }
      } catch (err) {
        console.error('Campaign runner error:', err);
      } finally {
        runningCampaigns.delete(campaignId);
      }
    })();
  }

  return true;
}

export async function pauseCampaign(campaignId: string): Promise<boolean> {
  const r = await transitionCampaignStatus(campaignId, 'paused');
  return !!r;
}

export async function resumeCampaign(campaignId: string): Promise<boolean> {
  const c = await getCampaign(campaignId);
  if (!c) return false;
  if (c.status !== 'paused') return false;
  const r = await transitionCampaignStatus(campaignId, 'sending');
  if (!r) return false;
  await startCampaign(campaignId);
  return true;
}

export async function cancelCampaign(campaignId: string): Promise<boolean> {
  const c = await getCampaign(campaignId);
  if (!c) return false;
  if (['completed', 'cancelled'].includes(c.status)) return true;
  const r = await transitionCampaignStatus(campaignId, 'cancelled');
  return !!r;
}

export function getRunningCampaigns(): string[] {
  return Array.from(runningCampaigns);
}
