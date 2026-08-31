import { getDb, mapDoc } from '@db/index';
import { normalizePhone, isValidPhone, isValidEmail, paginate } from '@lib/validation';
import { ObjectId } from 'mongodb';

export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  company: string | null;
  city: string | null;
  email: string | null;
  custom_fields: string | null;
  opted_out: number;
  created_at: number;
  updated_at: number;
}

export interface ContactInput {
  phone: string;
  name?: string;
  company?: string;
  city?: string;
  email?: string;
  customFields?: Record<string, string>;
}

export async function createContact(input: ContactInput): Promise<{ contact: Contact | null; error?: string; isDuplicate?: boolean }> {
  const db = getDb();
  const phone = normalizePhone(input.phone);

  if (!isValidPhone(phone)) {
    return { contact: null, error: 'Invalid phone number' };
  }
  if (input.email && !isValidEmail(input.email)) {
    return { contact: null, error: 'Invalid email address' };
  }

  const existing = await db.collection('contacts').findOne({ phone });
  if (existing) {
    return { contact: mapDoc<Contact>(existing), isDuplicate: true };
  }

  const now = Date.now();
  const result = await db.collection('contacts').insertOne({
    phone,
    name: input.name?.trim() || null,
    company: input.company?.trim() || null,
    city: input.city?.trim() || null,
    email: input.email?.trim() || null,
    custom_fields: input.customFields ? JSON.stringify(input.customFields) : null,
    opted_out: 0,
    created_at: now,
    updated_at: now
  });

  const contact = await db.collection('contacts').findOne({ _id: result.insertedId });
  return { contact: mapDoc<Contact>(contact) };
}

export async function updateContact(id: string, input: Partial<ContactInput>): Promise<Contact | null> {
  const db = getDb();
  let existing;
  try {
    existing = await db.collection('contacts').findOne({ _id: new ObjectId(id) });
  } catch (e) {
    return null;
  }
  if (!existing) return null;

  const updateFields: any = {};

  if (input.phone !== undefined) {
    const phone = normalizePhone(input.phone);
    if (!isValidPhone(phone)) return null;
    updateFields.phone = phone;
  }
  if (input.name !== undefined) updateFields.name = input.name?.trim() || null;
  if (input.company !== undefined) updateFields.company = input.company?.trim() || null;
  if (input.city !== undefined) updateFields.city = input.city?.trim() || null;
  if (input.email !== undefined) {
    if (input.email && !isValidEmail(input.email)) return null;
    updateFields.email = input.email?.trim() || null;
  }
  if (input.customFields !== undefined) {
    updateFields.custom_fields = JSON.stringify(input.customFields);
  }
  updateFields.updated_at = Date.now();

  await db.collection('contacts').updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
  const updated = await db.collection('contacts').findOne({ _id: new ObjectId(id) });
  return mapDoc<Contact>(updated);
}

export async function deleteContact(id: string): Promise<boolean> {
  const db = getDb();
  try {
    const result = await db.collection('contacts').deleteOne({ _id: new ObjectId(id) });
    return (result.deletedCount || 0) > 0;
  } catch (e) {
    return false;
  }
}

export async function getContact(id: string): Promise<Contact | null> {
  const db = getDb();
  try {
    const result = await db.collection('contacts').findOne({ _id: new ObjectId(id) });
    return mapDoc<Contact>(result);
  } catch (e) {
    return null;
  }
}

export async function getContactByPhone(phone: string): Promise<Contact | null> {
  const db = getDb();
  const normalized = normalizePhone(phone);
  const result = await db.collection('contacts').findOne({ phone: normalized });
  return mapDoc<Contact>(result);
}

export async function listContacts(opts: {
  page?: number;
  perPage?: number;
  search?: string;
  optedOut?: boolean;
  listId?: string;
}): Promise<{ contacts: (Contact & { lists?: string })[]; total: number; pages: number; hasNext: boolean; hasPrev: boolean }> {
  const db = getDb();
  const page = opts.page || 1;
  const perPage = opts.perPage || 50;

  const matchFilter: any = {};
  if (opts.search) {
    const searchRegex = new RegExp(opts.search, 'i');
    matchFilter.$or = [
      { phone: searchRegex },
      { name: searchRegex },
      { company: searchRegex },
      { city: searchRegex },
      { email: searchRegex }
    ];
  }
  if (opts.optedOut !== undefined) {
    matchFilter.opted_out = opts.optedOut ? 1 : 0;
  }
  if (opts.listId) {
    const memberships = await db.collection('contact_list_members').find({ list_id: opts.listId }).toArray();
    const contactIds = memberships.map(m => {
      try { return new ObjectId(m.contact_id); } catch(e) { return null; }
    }).filter(id => id !== null) as ObjectId[];
    matchFilter._id = { $in: contactIds };
  }

  const total = await db.collection('contacts').countDocuments(matchFilter);
  const { pages, offset, hasNext, hasPrev } = paginate(total, page, perPage);

  const rawContacts = await db.collection('contacts')
    .find(matchFilter)
    .sort({ created_at: -1 })
    .skip(offset)
    .limit(perPage)
    .toArray();

  const contacts = [];
  for (const raw of rawContacts) {
    const mapped = mapDoc<Contact>(raw)!;
    // Get all lists this contact is a member of
    const memberships = await db.collection('contact_list_members').find({ contact_id: mapped.id }).toArray();
    const listIds = memberships.map(m => {
      try { return new ObjectId(m.list_id); } catch(e) { return null; }
    }).filter(id => id !== null) as ObjectId[];
    
    let listNames = '';
    if (listIds.length > 0) {
      const listsDoc = await db.collection('contact_lists').find({ _id: { $in: listIds } }).toArray();
      listNames = listsDoc.map(l => l.name).join(', ');
    }
    contacts.push({ ...mapped, lists: listNames || undefined });
  }

  return { contacts, total, pages, hasNext, hasPrev };
}

export async function optOutContact(phone: string, reason?: string, source?: string): Promise<boolean> {
  const db = getDb();
  const normalized = normalizePhone(phone);
  const now = Date.now();
  
  await db.collection('opt_outs').updateOne(
    { phone: normalized },
    {
      $setOnInsert: {
        phone: normalized,
        reason: reason || null,
        source: source || 'STOP',
        opted_out_at: now
      }
    },
    { upsert: true }
  );

  await db.collection('contacts').updateOne(
    { phone: normalized },
    { $set: { opted_out: 1, updated_at: now } }
  );
  
  return true;
}

export async function isOptedOut(phone: string): Promise<boolean> {
  const db = getDb();
  const normalized = normalizePhone(phone);
  const row = await db.collection('opt_outs').findOne({ phone: normalized });
  if (row) return true;
  const contact = await db.collection('contacts').findOne({ phone: normalized });
  return contact?.opted_out === 1;
}

export async function bulkCreateContacts(inputs: ContactInput[]): Promise<{
  created: number; updated: number; duplicates: number; errors: { row: number; phone: string; error: string }[]
}> {
  const db = getDb();
  let created = 0, updated = 0, duplicates = 0;
  const errors: { row: number; phone: string; error: string }[] = [];

  const chunks = inputs.map((input, idx) => ({ input, idx: idx + 2 }));
  for (const { input, idx } of chunks) {
    try {
      const phone = normalizePhone(input.phone);
      if (!isValidPhone(phone)) {
        errors.push({ row: idx, phone: input.phone, error: 'Invalid phone' });
        continue;
      }
      const existing = await db.collection('contacts').findOne({ phone });
      const now = Date.now();
      if (existing) {
        duplicates++;
        const hadData = existing.name || existing.company;
        await db.collection('contacts').updateOne(
          { phone },
          {
            $set: {
              name: input.name?.trim() || existing.name || null,
              company: input.company?.trim() || existing.company || null,
              city: input.city?.trim() || existing.city || null,
              email: input.email?.trim() || existing.email || null,
              custom_fields: input.customFields ? JSON.stringify(input.customFields) : existing.custom_fields || null,
              updated_at: now
            }
          }
        );
        if (!hadData) updated++;
      } else {
        await db.collection('contacts').insertOne({
          phone,
          name: input.name?.trim() || null,
          company: input.company?.trim() || null,
          city: input.city?.trim() || null,
          email: input.email?.trim() || null,
          custom_fields: input.customFields ? JSON.stringify(input.customFields) : null,
          opted_out: 0,
          created_at: now,
          updated_at: now
        });
        created++;
      }
    } catch (e: any) {
      errors.push({ row: idx, phone: input.phone, error: e.message || 'Unknown error' });
    }
  }

  return { created, updated, duplicates, errors };
}

export async function createList(name: string, description?: string): Promise<string> {
  const db = getDb();
  const now = Date.now();
  const result = await db.collection('contact_lists').insertOne({
    name: name.trim(),
    description: description?.trim() || null,
    contact_count: 0,
    created_at: now,
    updated_at: now
  });
  return result.insertedId.toString();
}

export async function listContactLists(): Promise<{ id: string; name: string; description: string | null; contact_count: number; created_at: number }[]> {
  const db = getDb();
  const lists = await db.collection('contact_lists').find({}).sort({ created_at: -1 }).toArray();
  const result = [];
  for (const l of lists) {
    const listIdStr = l._id.toString();
    const contactCount = await db.collection('contact_list_members').countDocuments({ list_id: listIdStr });
    result.push({
      id: listIdStr,
      name: l.name,
      description: l.description,
      contact_count: contactCount,
      created_at: l.created_at
    });
  }
  return result;
}

export async function addContactsToList(listId: string, contactIds: string[]): Promise<number> {
  if (!contactIds.length) return 0;
  const db = getDb();
  const now = Date.now();
  
  for (const contactId of contactIds) {
    await db.collection('contact_list_members').updateOne(
      { list_id: listId, contact_id: contactId },
      { $setOnInsert: { added_at: now } },
      { upsert: true }
    );
  }

  const count = await db.collection('contact_list_members').countDocuments({ list_id: listId });
  await db.collection('contact_lists').updateOne(
    { _id: new ObjectId(listId) },
    { $set: { contact_count: count, updated_at: now } }
  );
  return contactIds.length;
}

export async function getContactsInList(listId: string): Promise<Contact[]> {
  const db = getDb();
  const memberships = await db.collection('contact_list_members').find({ list_id: listId }).toArray();
  const contactIds = memberships.map(m => {
    try { return new ObjectId(m.contact_id); } catch(e) { return null; }
  }).filter(id => id !== null) as ObjectId[];

  if (!contactIds.length) return [];

  const rawContacts = await db.collection('contacts')
    .find({ _id: { $in: contactIds }, opted_out: 0 })
    .toArray();

  return rawContacts.map(c => mapDoc<Contact>(c)!) as Contact[];
}

export async function deleteList(listId: string): Promise<boolean> {
  const db = getDb();
  try {
    const result = await db.collection('contact_lists').deleteOne({ _id: new ObjectId(listId) });
    // Cleanup list members
    await db.collection('contact_list_members').deleteMany({ list_id: listId });
    return (result.deletedCount || 0) > 0;
  } catch (e) {
    return false;
  }
}
