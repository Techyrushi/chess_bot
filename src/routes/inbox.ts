import { Request, Response, NextFunction } from 'express';
import { listInbox, markInboxAsRead, getConversation } from '../services/inbox';

export default async function handleInbox(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, params, body, query } = req;

    // GET /inbox - Page
    if (method === 'GET' && path === '/inbox') {
      const page = Number(query.page) || 1;
      const perPage = Number(query.perPage) || 50;
      const data = await listInbox({ page, perPage });
      const pages = Math.ceil(data.total / perPage);
      return res.render('inbox/index', {
        title: 'Inbox',
        admin: req.admin,
        messages: data.messages,
        pagination: { page, perPage, total: data.total, pages }
      });
    }

    // API: GET /api/inbox
    if (method === 'GET' && path === '/api/inbox') {
      const page = Number(query.page) || 1;
      const perPage = Number(query.perPage) || 50;
      const data = await listInbox({ page, perPage });
      const pages = Math.ceil(data.total / perPage);
      return res.json({ ...data, pages });
    }

    // API: GET /api/inbox/:id - Get conversation
    if (method === 'GET' && path.match(/^\/api\/inbox\/[\w-\+]+$/)) {
      const phone = decodeURIComponent(params.id);
      const messages = await getConversation(phone);
      if (!messages || messages.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      return res.json({ messages, phone, count: messages.length });
    }

    // API: POST /api/inbox/:id/reply - Send reply (placeholder)
    if (method === 'POST' && path.match(/^\/api\/inbox\/[\w-\+]+\/reply$/)) {
      const { message } = body;
      if (!message) {
        return res.status(400).json({ error: 'Message required' });
      }
      // TODO: Implement actual reply sending via Twilio
      return res.json({ success: true, message: 'Reply queued for sending (not yet implemented)' });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Inbox error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
