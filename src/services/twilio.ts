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
    const messageParams: any = {
      from,
      to,
      body: opts.body
    };

    if (opts.statusCallback) {
      messageParams.statusCallback = opts.statusCallback;
    }

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
    const messageParams: any = {
      from,
      to,
      contentSid: opts.templateSid
    };

    if (opts.templateVariables && opts.templateVariables.length > 0) {
      messageParams.contentVariables = JSON.stringify(opts.templateVariables);
    }

    if (opts.statusCallback) {
      messageParams.statusCallback = opts.statusCallback;
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
