import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import { getTemplate, updateTemplate, deleteTemplate } from '@services/templates';

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  const t = await getTemplate(id || '');
  if (!t) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(JSON.stringify(t));
};

export const PUT: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  try {
    const body = await request.json();
    const t = await updateTemplate(id || '', body);
    if (!t) return new Response(JSON.stringify({ error: 'Not found or update failed' }), { status: 400 });
    return new Response(JSON.stringify(t));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Invalid request' }), { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const id = params.id;
  const ok = await deleteTemplate(id || '');
  return new Response(JSON.stringify({ success: ok }));
};

