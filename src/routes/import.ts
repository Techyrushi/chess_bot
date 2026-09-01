import { Request, Response, NextFunction } from 'express';
import { parseExcelBuffer, mapAndValidateRows } from '../services/excel';
import { bulkCreateContacts, addContactsToList } from '../services/contacts';

export default async function handleImport(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, body, query } = req;

    // GET /import - Page
    if (method === 'GET' && path === '/import') {
      return res.render('import/index', {
        title: 'Import Contacts',
        admin: req.admin
      });
    }

    // API: POST /api/import/preview
    if (method === 'POST' && path === '/api/import/preview') {
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const preview = parseExcelBuffer(file.buffer);
      return res.json(preview);
    }

    // API: POST /api/import/process
    if (method === 'POST' && path === '/api/import/process') {
      const { data, columnMap, listId, listName } = body;
      if (!data || !columnMap) {
        return res.status(400).json({ error: 'Missing data or columnMap' });
      }

      const validation = mapAndValidateRows(data, columnMap);
      if (validation.errors.length > 0) {
        return res.status(400).json({
          error: `${validation.errors.length} rows have errors`,
          errors: validation.errors,
          duplicates: Array.from(validation.duplicates)
        });
      }

      const created = await bulkCreateContacts(validation.valid);

      if (listId) {
        const contactIds = created.map((c: any) => c.id);
        await addContactsToList(listId, contactIds);
      }

      return res.json({
        success: true,
        imported: created.length,
        listName: listName || listId
      });
    }

    // API: GET /api/import/sample
    if (method === 'GET' && path === '/api/import/sample') {
      const sample = [
        { 'Phone Number': '+1234567890', 'Name': 'John Doe', 'Company': 'Acme Inc', 'City': 'New York', 'Email': 'john@example.com' },
        { 'Phone Number': '+1987654321', 'Name': 'Jane Smith', 'Company': 'Tech Corp', 'City': 'San Francisco', 'Email': 'jane@example.com' }
      ];
      return res.json(sample);
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
