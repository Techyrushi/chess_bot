import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import { getAllSettings, setSetting } from '@lib/settings';
import { verifyPassword, updateAdminPassword, findAdminByEmail } from '@lib/auth';
import { createAuditLog } from '@lib/audit';

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const all = await getAllSettings();
  const safe = { ...all };
  if (safe.twilio_auth_token) {
    safe.twilio_auth_token = safe.twilio_auth_token ? '••••••••' + safe.twilio_auth_token.slice(-4) : '';
  }
  return new Response(JSON.stringify(safe));
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    const details: Record<string, any> = {};

    if (body.twilio_account_sid !== undefined) {
      await setSetting('twilio_account_sid', String(body.twilio_account_sid));
      details.twilio = true;
    }
    if (body.twilio_auth_token !== undefined && !body.twilio_auth_token.startsWith('••••')) {
      await setSetting('twilio_auth_token', String(body.twilio_auth_token));
      details.twilioAuthToken = true;
    }
    if (body.twilio_whatsapp_number !== undefined) {
      await setSetting('twilio_whatsapp_number', String(body.twilio_whatsapp_number));
    }
    if (body.twilio_webhook_secret !== undefined && !body.twilio_webhook_secret.startsWith('••••')) {
      await setSetting('twilio_webhook_secret', String(body.twilio_webhook_secret));
    }
    if (body.default_whatsapp_template_sid !== undefined) {
      await setSetting('default_whatsapp_template_sid', String(body.default_whatsapp_template_sid).trim());
    }
    if (body.send_delay_min_ms !== undefined) {
      await setSetting('send_delay_min_ms', String(body.send_delay_min_ms));
    }
    if (body.send_delay_max_ms !== undefined) {
      await setSetting('send_delay_max_ms', String(body.send_delay_max_ms));
    }
    if (body.max_retries !== undefined) {
      await setSetting('max_retries', String(body.max_retries));
    }

    if (body.changePassword) {
      const admin = await findAdminByEmail(body.email || '') || null;
      if (!admin || !verifyPassword(body.currentPassword || '', admin.password_hash)) {
        return new Response(JSON.stringify({ error: 'Current password is incorrect' }), { status: 400 });
      }
      if (!body.newPassword || body.newPassword.length < 8) {
        return new Response(JSON.stringify({ error: 'New password must be at least 8 characters' }), { status: 400 });
      }
      await updateAdminPassword(admin.id, body.newPassword);
      details.passwordChanged = true;
    }

    await createAuditLog({ adminId: auth.adminId, action: 'settings_updated', details });
    return new Response(JSON.stringify({ success: true }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
