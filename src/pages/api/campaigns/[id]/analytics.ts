import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as campaigns from '@services/campaigns';
import { renderTemplate } from '@services/campaigns';

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id || '';
  return new Response(JSON.stringify(await campaigns.getCampaignAnalytics(id || '')));
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    const messageBody = String(body.messageBody || '');
    const sampleContact = {
      id: '0',
      phone: body.phone || '+1234567890',
      name: body.name || 'John Doe',
      company: body.company || 'Acme Corp',
      city: body.city || 'New York',
      email: body.email || 'john@example.com',
      custom_fields: JSON.stringify(body.customFields || {}),
      opted_out: 0,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    const rendered = renderTemplate(messageBody, sampleContact);
    return new Response(JSON.stringify({ preview: rendered, variables: campaigns.extractVariables(messageBody) }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
