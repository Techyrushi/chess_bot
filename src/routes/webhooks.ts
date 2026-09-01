import { Request, Response, NextFunction } from 'express';
import { handleIncomingMessage, handleStatusUpdate } from '../webhooks/twilio';

export default async function handleWebhooks(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, body, query } = req;

    // POST /api/webhooks/twilio/incoming
    if (method === 'POST' && path === '/api/webhooks/twilio/incoming') {
      const result = await handleIncomingMessage(body as Record<string, string>);
      return res.status(result.statusCode).json({ success: result.ok, message: result.message });
    }

    // POST /api/webhooks/twilio/status
    if (method === 'POST' && path === '/api/webhooks/twilio/status') {
      const result = await handleStatusUpdate(body as Record<string, string>);
      return res.status(result.statusCode).json({ success: result.ok, message: result.message });
    }

    // POST /api/test-message
    if (method === 'POST' && path === '/api/test-message') {
      const { phone, templateSid } = body;
      if (!phone || !templateSid) {
        return res.status(400).json({ error: 'Phone and templateSid required' });
      }
      // TODO: Implement actual test message sending via Twilio
      return res.json({ success: true, message: 'Test message queued (not yet implemented)' });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
