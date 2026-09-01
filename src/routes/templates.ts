import { Request, Response, NextFunction } from 'express';
import { listTemplates, createTemplate, getTemplate, updateTemplate, deleteTemplate } from '../services/templates';

export default async function handleTemplates(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, params, body, query } = req;

    // GET /templates - Page
    if (method === 'GET' && path === '/templates') {
      const templates = await listTemplates();
      return res.render('templates/index', {
        title: 'Templates',
        admin: req.admin,
        templates
      });
    }

    // API: GET /api/templates
    if (method === 'GET' && path === '/api/templates') {
      const templates = await listTemplates();
      return res.json(templates);
    }

    // API: POST /api/templates
    if (method === 'POST' && path === '/api/templates') {
      const template = await createTemplate(body);
      return res.status(201).json(template);
    }

    // API: GET /api/templates/:id
    if (method === 'GET' && path.match(/^\/api\/templates\/[\w-]+$/)) {
      const template = await getTemplate(params.id);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      return res.json(template);
    }

    // API: PUT /api/templates/:id
    if (method === 'PUT' && path.match(/^\/api\/templates\/[\w-]+$/)) {
      const template = await updateTemplate(params.id, body);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      return res.json(template);
    }

    // API: DELETE /api/templates/:id
    if (method === 'DELETE' && path.match(/^\/api\/templates\/[\w-]+$/)) {
      const success = await deleteTemplate(params.id);
      if (!success) {
        return res.status(404).json({ error: 'Template not found' });
      }
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Templates error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
