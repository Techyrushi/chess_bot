export const POST = async ({ request }: { request: Request }) => {
  const { requireAuth, parseSessionFromCookies, destroySession, getClearCookieHeader } = await import('@lib/sessions');
  const { createAuditLog } = await import('@lib/audit');

  const cookieHeader = request.headers.get('cookie');
  const sessionId = parseSessionFromCookies(cookieHeader);
  const auth = await requireAuth(request);
  if (auth?.adminId) {
    await createAuditLog({ adminId: auth.adminId, action: 'logout' });
  }
  if (sessionId) {
    await destroySession(sessionId);
  }
  return Response.json({ success: true }, {
    status: 200,
    headers: { 'Set-Cookie': getClearCookieHeader() }
  });
};
