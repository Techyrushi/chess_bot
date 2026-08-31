export const GET = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const echo = url.searchParams.get('hub.challenge');
  if (echo) {
    return new Response(echo, { status: 200 });
  }
  return new Response('OK', { status: 200 });
};

export const POST = async ({ request }: { request: Request }) => {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const obj: Record<string, string> = {};
  params.forEach((v, k) => { obj[k] = v; });

  const sig = request.headers.get('X-Twilio-Signature') || '';
  const urlStr = request.url;

  const { handleIncomingMessage } = await import('@/webhooks/twilio');
  const r = await handleIncomingMessage(obj, sig, urlStr);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status: r.statusCode,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' }
  });
};
