import twilio from 'twilio';
import { getTwilioSettings } from '@lib/settings';
import { toWhatsAppFormat } from '@lib/validation';

export interface SendResult {
  success: boolean;
  sid?: string;
  errorCode?: number;
  errorMessage?: string;
  status?: string;
}

export function normalizeTwilioMessageStatus(status?: string): 'sent' | 'pending' | 'failed' {
  const normalized = String(status || '').trim().toLowerCase();
  if (['sent', 'delivered', 'read'].includes(normalized)) return 'sent';
  if (['accepted', 'queued', 'sending', 'pending'].includes(normalized)) return 'pending';
  return 'failed';
}

export function resolveTwilioStatusCallbackUrl(url?: string): string | undefined {
  const raw = String(url || '').trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/\/+$/, '');

  try {
    const parsed = new URL(cleaned);
    const host = parsed.hostname.toLowerCase();
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(host);
    if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && !isLocalhost) {
      return cleaned;
    }
  } catch (e) {}

  return undefined;
}

export async function getTwilioClient() {
  const settings = await getTwilioSettings();
  if (!settings.accountSid || !settings.authToken) {
    return null;
  }
  return twilio(settings.accountSid, settings.authToken);
}

export async function sendWhatsAppMessage(opts: {
  to: string;
  body: string;
  mediaUrl?: string;
  mediaType?: string;
  statusCallback?: string;
  fromOverride?: string;
}): Promise<SendResult> {
  const client = await getTwilioClient();
  if (!client) {
    return { success: false, errorMessage: 'Twilio not configured' };
  }

  const settings = await getTwilioSettings();
  const from = opts.fromOverride || settings.whatsappNumber;
  const to = toWhatsAppFormat(opts.to);

  try {
    const callbackUrl = resolveTwilioStatusCallbackUrl(opts.statusCallback || process.env.APP_URL || process.env.PUBLIC_URL);
    if (!callbackUrl) {
      return {
        success: false,
        errorMessage: 'Twilio status callback URL is invalid or missing. Set APP_URL to a public HTTPS URL (for example a ngrok or production domain) before sending.',
        status: 'failed'
      };
    }

    const messageParams: any = {
      from,
      to,
      body: opts.body,
      statusCallback: callbackUrl
    };

    if (opts.mediaUrl) {
      messageParams.mediaUrl = [opts.mediaUrl];
    }

    const message = await client.messages.create(messageParams);
    return {
      success: true,
      sid: message.sid,
      status: message.status
    };
  } catch (err: any) {
    return {
      success: false,
      errorCode: err.code,
      errorMessage: err.message || 'Unknown Twilio error',
      status: 'failed'
    };
  }
}

export async function fetchMessageStatus(sid: string): Promise<{ status?: string; errorCode?: number; errorMessage?: string }> {
  const client = await getTwilioClient();
  if (!client) return {};
  try {
    const m = await client.messages(sid).fetch();
    return {
      status: m.status,
      errorCode: m.errorCode || undefined,
      errorMessage: m.errorMessage || undefined
    };
  } catch (err: any) {
    return { errorMessage: err.message };
  }
}

export async function sendWhatsAppTemplate(opts: {
  to: string;
  templateSid: string;
  templateVariables?: string[];
  statusCallback?: string;
  fromOverride?: string;
}): Promise<SendResult> {
  const client = await getTwilioClient();
  if (!client) {
    return { success: false, errorMessage: 'Twilio not configured' };
  }

  const settings = await getTwilioSettings();
  const from = opts.fromOverride || settings.whatsappNumber;
  const to = toWhatsAppFormat(opts.to);

  try {
    const callbackUrl = resolveTwilioStatusCallbackUrl(opts.statusCallback || process.env.APP_URL || process.env.PUBLIC_URL);
    if (!callbackUrl) {
      return {
        success: false,
        errorMessage: 'Twilio status callback URL is invalid or missing. Set APP_URL to a public HTTPS URL (for example a ngrok or production domain) before sending.',
        status: 'failed'
      };
    }

    const messageParams: any = {
      from,
      to,
      contentSid: opts.templateSid,
      statusCallback: callbackUrl
    };

    if (opts.templateVariables && opts.templateVariables.length > 0) {
      messageParams.contentVariables = JSON.stringify(opts.templateVariables);
    }

    const message = await client.messages.create(messageParams);
    return {
      success: true,
      sid: message.sid,
      status: message.status
    };
  } catch (err: any) {
    return {
      success: false,
      errorCode: err.code,
      errorMessage: err.message || 'Unknown Twilio error',
      status: 'failed'
    };
  }
}

export async function isConfigured(): Promise<boolean> {
  const s = await getTwilioSettings();
  return !!(s.accountSid && s.authToken && s.whatsappNumber);
}
