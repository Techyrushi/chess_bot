import { Request, Response, NextFunction } from 'express';
import { getTwilioSettings, setSetting } from '../lib/settings';

export default async function handleSettings(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, body } = req;

    // GET /settings - Page
    if (method === 'GET' && path === '/settings') {
      const settings = await getTwilioSettings();
      return res.render('settings/index', {
        title: 'Settings',
        admin: req.admin,
        settings
      });
    }

    // API: GET /api/settings
    if (method === 'GET' && path === '/api/settings') {
      const settings = await getTwilioSettings();
      return res.json(settings);
    }

    // API: POST /api/settings - Save send settings
    if (method === 'POST' && path === '/api/settings') {
      const { sendDelayMin, sendDelayMax, maxRetries } = body;
      if (sendDelayMin !== undefined) {
        await setSetting('send_delay_min_ms', String(sendDelayMin));
      }
      if (sendDelayMax !== undefined) {
        await setSetting('send_delay_max_ms', String(sendDelayMax));
      }
      if (maxRetries !== undefined) {
        await setSetting('max_retries', String(maxRetries));
      }
      return res.json({ success: true });
    }

    // API: POST /api/settings/whatsapp-template - Set default template
    if (method === 'POST' && path === '/api/settings/whatsapp-template') {
      const { templateSid } = body;
      if (!templateSid) {
        return res.status(400).json({ error: 'Template SID required' });
      }
      await setSetting('default_whatsapp_template_sid', templateSid);
      return res.json({ success: true, templateSid });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Settings error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
