import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import { setSetting, getTwilioSettings } from '@lib/settings';
import { getDb } from '@db/index';

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  try {
    const settings = await getTwilioSettings();
    return new Response(JSON.stringify({
      currentTemplate: settings.defaultTemplateSid,
      message: 'Current default WhatsApp template SID'
    }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  try {
    const body = await request.json();
    const templateSid = String(body.templateSid || '').trim();

    if (!templateSid) {
      return new Response(JSON.stringify({ error: 'templateSid is required' }), { status: 400 });
    }

    // Validate format (should start with HX or HM)
    if (!templateSid.match(/^H[XM][a-f0-9]+$/i)) {
      return new Response(JSON.stringify({ error: 'Invalid template SID format. Should start with HX or HM' }), { status: 400 });
    }

    await setSetting('default_whatsapp_template_sid', templateSid);

    const audit = getDb().collection('audit_logs');
    await audit.insertOne({
      admin_id: auth.adminId,
      action: 'update_whatsapp_template',
      details: { templateSid },
      created_at: Date.now()
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'WhatsApp template updated successfully',
      templateSid
    }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
