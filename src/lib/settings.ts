import { getDb } from '@db/index';

export async function getSetting(key: string, defaultValue: string = ''): Promise<string> {
  const db = getDb();
  const row = await db.collection('settings').findOne({ key });
  return row?.value ?? defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.collection('settings').updateOne(
    { key },
    { 
      $set: { 
        value, 
        updated_at: Date.now() 
      } 
    },
    { upsert: true }
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db.collection('settings').find({}).toArray();
  const result: Record<string, string> = {};
  for (const r of rows) {
    result[r.key] = r.value || '';
  }
  return result;
}

export interface TwilioSettings {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
  webhookSecret: string;
  defaultTemplateSid?: string;
}

export async function getTwilioSettings(): Promise<TwilioSettings> {
  return {
    accountSid: await getSetting('twilio_account_sid', process.env.TWILIO_ACCOUNT_SID || ''),
    authToken: await getSetting('twilio_auth_token', process.env.TWILIO_AUTH_TOKEN || ''),
    whatsappNumber: await getSetting('twilio_whatsapp_number', process.env.TWILIO_WHATSAPP_NUMBER || ''),
    webhookSecret: await getSetting('twilio_webhook_secret', process.env.TWILIO_WEBHOOK_SECRET || ''),
    defaultTemplateSid: await getSetting('default_whatsapp_template_sid', process.env.DEFAULT_WHATSAPP_TEMPLATE_SID || '')
  };
}

export async function getSendSettings(): Promise<{ delayMin: number; delayMax: number; maxRetries: number }> {
  return {
    delayMin: parseInt(await getSetting('send_delay_min_ms', process.env.SEND_DELAY_MIN_MS || '1000'), 10),
    delayMax: parseInt(await getSetting('send_delay_max_ms', process.env.SEND_DELAY_MAX_MS || '3000'), 10),
    maxRetries: parseInt(await getSetting('max_retries', process.env.MAX_RETRIES || '3'), 10)
  };
}
