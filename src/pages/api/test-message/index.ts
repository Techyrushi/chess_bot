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
    const templateSid = settings.defaultTemplateSid;

    if (!templateSid) {
      return new Response(JSON.stringify({ error: 'WhatsApp template not configured' }), { status: 400 });
    }

    // Send using approved template
    const templateVariables = body.templateVariables || [
      body.body || 'Test message from WhatsApp Campaign Manager'
    ];

    const r = await twilio.sendWhatsAppTemplate({
      to: phone,
      templateSid,
      templateVariables,
      statusCallback: `${process.env.APP_URL || 'http://localhost:4321'}/api/webhooks/twilio/status`
    });

    const now = Date.now();
    await createAuditLog({
      adminId: auth.adminId,
      action: 'test_message_sent',
      details: {
        to: phone,
        sid: r.sid,
        templateSid,
        status: r.success ? 'queued' : 'failed',
        error: r.errorMessage,
        timestamp: new Date().toISOString()
      }
    });

    return new Response(JSON.stringify({
      success: r.success,
      sid: r.sid,
      status: r.status,
      templateSid,
      errorMessage: r.errorMessage,
      timestamp: new Date().toISOString(),
      message: r.success ? 'Message queued for delivery using approved template' : 'Failed to send message'
    }), { status: r.success ? 200 : 400 });
  } catch (e: any) {
    console.error('Test message error:', e);
    return new Response(JSON.stringify({ error: e.message, timestamp: new Date().toISOString() }), { status: 400 });
  }
};
