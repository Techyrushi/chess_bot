import { Request, Response, NextFunction } from 'express';
import { listContacts, createContact, getContact, updateContact, deleteContact } from '../services/contacts';

export default async function handleContacts(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, params, body, query } = req;

    // GET /contacts - Page
    if (method === 'GET' && path === '/contacts') {
      const page = Number(query.page) || 1;
      const perPage = Number(query.perPage) || 50;
      const search = query.search || '';
      const listId = query.listId || '';

      const data = await listContacts({ page, perPage, search, listId });
      return res.render('contacts/index', {
        title: 'Contacts',
        admin: req.admin,
        contacts: data.contacts,
        pagination: { page, perPage, total: data.total, pages: data.pages, hasNext: data.hasNext, hasPrev: data.hasPrev },
        search,
        listId
      });
    }

    // API: GET /api/contacts
    if (method === 'GET' && path === '/api/contacts') {
      const page = Number(query.page) || 1;
      const perPage = Number(query.perPage) || 50;
      const search = query.search || '';
      const listId = query.listId || '';

      const data = await listContacts({ page, perPage, search, listId });
      return res.json(data);
    }

    // API: POST /api/contacts
    if (method === 'POST' && path === '/api/contacts') {
      const contact = await createContact(body);
      if (contact.error) {
        return res.status(400).json({ error: contact.error, isDuplicate: contact.isDuplicate });
      }
      return res.status(201).json(contact.contact);
    }

    // API: GET /api/contacts/:id
    if (method === 'GET' && path.match(/^\/api\/contacts\/[\w-]+$/)) {
      const contact = await getContact(params.id);
      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }
      return res.json(contact);
    }

    // API: PUT /api/contacts/:id
    if (method === 'PUT' && path.match(/^\/api\/contacts\/[\w-]+$/)) {
      const contact = await updateContact(params.id, body);
      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }
      return res.json(contact);
    }

    // API: DELETE /api/contacts/:id
    if (method === 'DELETE' && path.match(/^\/api\/contacts\/[\w-]+$/)) {
      const success = await deleteContact(params.id);
      if (!success) {
        return res.status(404).json({ error: 'Contact not found' });
      }
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Contacts error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
