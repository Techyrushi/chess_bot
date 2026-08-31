import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as twilio from '@services/twilio';
import { createAuditLog } from '@lib/audit';
import { normalizePhone, isValidPhone } from '@lib/validation';
import { isOptedOut } from '@services/contacts';
import { getTwilioSettings } from '@lib/settings';

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    const phone = normalizePhone(String(body.phone || ''));
    if (!isValidPhone(phone)) return new Response(JSON.stringify({ error: 'Invalid phone' }), { status: 400 });
    if (await isOptedOut(phone)) return new Response(JSON.stringify({ error: 'Number opted out' }), { status: 400 });
    
    const settings = await getTwilioSettings();
    const templateSid = String(body.templateSid || settings.defaultTemplateSid || '').trim();

    if (!templateSid) {
      return new Response(JSON.stringify({ error: 'Approved WhatsApp template SID is required' }), { status: 400 });
    }

    const templateVariables = Array.isArray(body.templateVariables) ? body.templateVariables : [];

    const callbackUrl = twilio.resolveTwilioStatusCallbackUrl(process.env.APP_URL || process.env.PUBLIC_URL);
    if (!callbackUrl) {
      return new Response(JSON.stringify({
        success: false,
        status: 'failed',
        templateSid,
        errorMessage: 'APP_URL must be set to a public HTTPS URL for Twilio status callbacks. Use an ngrok URL or deployed domain, not localhost.',
        timestamp: new Date().toISOString(),
        message: 'Failed to send message'
      }), { status: 400 });
    }

    const r = await twilio.sendWhatsAppTemplate({
      to: phone,
      templateSid,
      templateVariables,
      statusCallback: `${callbackUrl}/api/webhooks/twilio/status`
    });

    const resolvedStatus = r.success ? twilio.normalizeTwilioMessageStatus(r.status) : 'failed';
    const timestamp = new Date().toISOString();
    await createAuditLog({
      adminId: auth.adminId,
      action: 'test_message_sent',
      details: {
        to: phone,
        sid: r.sid,
        templateSid,
        status: resolvedStatus,
        error: r.errorMessage,
        timestamp
      }
    });

    return new Response(JSON.stringify({
      success: r.success,
      sid: r.sid,
      status: resolvedStatus,
      templateSid,
      errorMessage: r.errorMessage,
      timestamp,
      message: r.success ? (resolvedStatus === 'pending' ? 'Message accepted and pending delivery using approved template' : 'Message sent using approved template') : 'Failed to send message'
    }), { status: r.success ? 200 : 400 });
  } catch (e: any) {
    console.error('Test message error:', e);
    return new Response(JSON.stringify({ error: e.message, timestamp: new Date().toISOString() }), { status: 400 });
  }
};
