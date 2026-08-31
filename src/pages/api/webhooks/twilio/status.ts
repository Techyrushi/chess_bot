export const POST = async ({ request }: { request: Request }) => {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const obj: Record<string, string> = {};
  params.forEach((v, k) => { obj[k] = v; });

  const sig = request.headers.get('X-Twilio-Signature') || '';
  const urlStr = request.url;

  const { handleStatusUpdate } = await import('@/webhooks/twilio');
  const r = await handleStatusUpdate(obj, sig, urlStr);
  return new Response(r.message, { status: r.statusCode });
};
