export const GET = async ({ request }: { request: Request }) => {
  const { requireAuth } = await import('@lib/sessions');
  if (!await requireAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { getDashboardStats } = await import('@services/campaigns');
  const stats = await getDashboardStats();
  return Response.json(stats);
};
