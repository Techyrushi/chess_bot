import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as campaigns from '@services/campaigns';

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try {
    const body = await request.json();
    const messageBody = String(body.messageBody || '');
    const sample = {
      id: 0,
      phone: '+1234567890',
      name: 'John Doe',
      company: 'Acme Inc',
      city: 'New York',
      email: 'john@example.com',
      custom_fields: JSON.stringify(body.customFields || {}),
      opted_out: 0,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    const rendered = campaigns.renderTemplate(messageBody, sample as any);
    const variables = campaigns.extractVariables(messageBody);
    return new Response(JSON.stringify({ preview: rendered, variables }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
