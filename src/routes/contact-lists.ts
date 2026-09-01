import { Request, Response, NextFunction } from 'express';
import { listContactLists, createList, getContactsInList, deleteList, addContactsToList } from '../services/contacts';

export default async function handleContactLists(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, params, body, query } = req;

    // API: GET /api/contact-lists
    if (method === 'GET' && path === '/api/contact-lists') {
      const lists = await listContactLists();
      return res.json(lists);
    }

    // API: POST /api/contact-lists
    if (method === 'POST' && path === '/api/contact-lists') {
      const { name, description } = body;
      if (!name) {
        return res.status(400).json({ error: 'Name required' });
      }
      const listId = await createList(name, description);
      return res.status(201).json({ id: listId, name, description: description || null });
    }

    // API: GET /api/contact-lists/:id
    if (method === 'GET' && path.match(/^\/api\/contact-lists\/[\w-]+$/)) {
      const contacts = await getContactsInList(params.id);
      if (!contacts) {
        return res.status(404).json({ error: 'List not found' });
      }
      return res.json({ contacts, count: contacts.length });
    }

    // API: DELETE /api/contact-lists/:id
    if (method === 'DELETE' && path.match(/^\/api\/contact-lists\/[\w-]+$/)) {
      const success = await deleteList(params.id);
      if (!success) {
        return res.status(404).json({ error: 'List not found' });
      }
      return res.json({ success: true });
    }

    // API: POST /api/contact-lists/:id/add-contacts
    if (method === 'POST' && path.match(/^\/api\/contact-lists\/[\w-]+\/add-contacts$/)) {
      const { contactIds } = body;
      if (!Array.isArray(contactIds)) {
        return res.status(400).json({ error: 'contactIds must be an array' });
      }
      const result = await addContactsToList(params.id, contactIds);
      return res.json(result);
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Contact lists error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
