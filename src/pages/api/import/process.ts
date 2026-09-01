import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as excel from '@services/excel';
import * as contacts from '@services/contacts';
import { createAuditLog } from '@lib/audit';

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const columnMapRaw = formData.get('columnMap');
    const listId = formData.get('listId') ? String(formData.get('listId')) : undefined;

    if (!file) return new Response(JSON.stringify({ error: 'No file' }), { status: 400 });
    if (!columnMapRaw) return new Response(JSON.stringify({ error: 'Column map required' }), { status: 400 });

    const columnMap = JSON.parse(String(columnMapRaw));
    if (!columnMap.phone) return new Response(JSON.stringify({ error: 'Phone mapping required. Please map your Phone column before importing.' }), { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const fullJson = excel.parseFullWorkbook(buf);
    const { valid, errors, duplicates, totalPhones } = excel.mapAndValidateRows(fullJson, columnMap);

    const result = await contacts.bulkCreateContacts(valid);

    if (listId && valid.length) {
      const ids: string[] = [];
      const db = (await import('@db/index')).getDb();
      for (const input of valid) {
        const phone = (await import('@lib/validation')).normalizePhone(input.phone);
        const c = await db.collection('contacts').findOne({ phone });
        if (c) ids.push(c._id.toString());
      }
      if (ids.length) await contacts.addContactsToList(listId, ids);
    }

    await createAuditLog({
      adminId: auth.adminId,
      action: 'contacts_imported',
      resourceType: listId ? 'contact_list' : 'contacts',
      resourceId: listId,
      details: {
        fileName: file.name,
        created: result.created,
        duplicates: duplicates.size + result.duplicates,
        errors: errors.length + result.errors.length
      }
    });

    return new Response(JSON.stringify({
      ...result,
      fileDuplicates: duplicates.size,
      fileErrors: errors,
      fileTotal: totalPhones,
      listId
    }));
  } catch (e: any) {
    const message = e?.message || 'Import error';
    if (message.includes('24 character hex string') || message.includes('ObjectId')) {
      return new Response(JSON.stringify({ error: 'Import failed because one or more stored contact-list IDs are invalid. Please recreate the list or retry with a valid list.' }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }
};
