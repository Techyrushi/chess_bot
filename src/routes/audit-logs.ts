import { Request, Response, NextFunction } from 'express';
import { getAuditLogs } from '../lib/audit';

export default async function handleAuditLogs(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, query } = req;

    // GET /audit-logs - Page
    if (method === 'GET' && path === '/audit-logs') {
      const page = Number(query.page) || 1;
      const perPage = Number(query.perPage) || 50;
      const offset = (page - 1) * perPage;
      const result = await getAuditLogs({ limit: perPage, offset });
      const pages = Math.ceil(result.total / perPage);
      return res.render('audit-logs/index', {
        title: 'Audit Logs',
        admin: req.admin,
        logs: result.logs,
        pagination: { page, perPage, total: result.total, pages }
      });
    }

    // API: GET /api/audit-logs
    if (method === 'GET' && path === '/api/audit-logs') {
      const page = Number(query.page) || 1;
      const perPage = Number(query.perPage) || 50;
      const offset = (page - 1) * perPage;
      const result = await getAuditLogs({ limit: perPage, offset });
      const pages = Math.ceil(result.total / perPage);
      return res.json({
        logs: result.logs,
        total: result.total,
        page,
        perPage,
        pages
      });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Audit logs error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
