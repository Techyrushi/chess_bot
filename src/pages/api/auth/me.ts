export const GET = async ({ request }: { request: Request }) => {
  const { requireAuth } = await import('@lib/sessions');
  const auth = await requireAuth(request);
  if (!auth) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  const { getAdminById } = await import('@lib/auth');
  const admin = await getAdminById(auth.adminId);
  if (!admin) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  return Response.json({ authenticated: true, admin });
};
