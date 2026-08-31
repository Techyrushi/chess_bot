export const POST = async ({ request }: { request: Request }) => {
  try {
    const body = await request.json();
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');

    if (!email || !password) {
      return Response.json({ error: 'Email and password required' }, { status: 400 });
    }

    const { findAdminByEmail, verifyPassword } = await import('@lib/auth');
    const admin = await findAdminByEmail(email);

    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const ip = request.headers.get('x-forwarded-for') || undefined;
    const ua = request.headers.get('user-agent') || undefined;

    const { createSession, getSessionCookieHeader } = await import('@lib/sessions');
    const { id, expiresAt } = await createSession(admin.id, { ip, ua });

    const { createAuditLog } = await import('@lib/audit');
    await createAuditLog({ adminId: admin.id, action: 'login', ip, ua });

    const secure = request.url.startsWith('https://');
    return Response.json({
      success: true,
      admin: { id: admin.id, email: admin.email, name: admin.name }
    }, {
      status: 200,
      headers: { 'Set-Cookie': getSessionCookieHeader(id, expiresAt, secure) }
    });
  } catch (e: any) {
    return Response.json({ error: e.message || 'Server error' }, { status: 500 });
  }
};
