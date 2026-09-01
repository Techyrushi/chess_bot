import { Request, Response, NextFunction } from 'express';
import { getDashboardStats } from '../services/campaigns';

export default async function handleDashboard(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path } = req;

    // GET / - Dashboard Page
    if (method === 'GET' && path === '/') {
      const stats = await getDashboardStats();
      return res.render('index', {
        title: 'Dashboard',
        admin: req.admin,
        stats
      });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
