import { getDb, mapDoc } from '@db/index';
import { ObjectId } from 'mongodb';

export interface Template {
  id: string;
  name: string;
  sid: string | null;
  body: string;
  variables: string | null;
  category: string | null;
  language: string;
  status: string;
  media_url: string | null;
  media_type: string | null;
  created_at: number;
  updated_at: number;
}

export async function createTemplate(data: {
  name: string;
  sid?: string;
  body: string;
  category?: string;
  language?: string;
  variables?: string[];
  mediaUrl?: string;
  mediaType?: string;
}): Promise<Template> {
  const db = getDb();
  const now = Date.now();
  const result = await db.collection('templates').insertOne({
    name: data.name.trim(),
    sid: data.sid || null,
    body: data.body,
    variables: data.variables ? JSON.stringify(data.variables) : null,
    category: data.category || null,
    language: data.language || 'en',
    status: 'approved',
    media_url: data.mediaUrl || null,
    media_type: data.mediaType || null,
    created_at: now,
    updated_at: now
  });
  return (await getTemplate(result.insertedId.toString()))!;
}

export async function getTemplate(id: string): Promise<Template | null> {
  const db = getDb();
  try {
    const r = await db.collection('templates').findOne({ _id: new ObjectId(id) });
    return mapDoc<Template>(r);
  } catch (e) {
    return null;
  }
}

export async function listTemplates(): Promise<Template[]> {
  const db = getDb();
  const rows = await db.collection('templates').find({}).sort({ created_at: -1 }).toArray();
  return rows.map(r => mapDoc<Template>(r)!) as Template[];
}

export async function updateTemplate(id: string, data: {
  name?: string;
  sid?: string;
  body?: string;
  category?: string;
  language?: string;
  variables?: string[];
  mediaUrl?: string;
  mediaType?: string;
  status?: string;
}): Promise<Template | null> {
  const db = getDb();
  try {
    const updateFields: any = { updated_at: Date.now() };
    if (data.name !== undefined) updateFields.name = data.name.trim();
    if (data.sid !== undefined) updateFields.sid = data.sid || null;
    if (data.body !== undefined) updateFields.body = data.body;
    if (data.category !== undefined) updateFields.category = data.category || null;
    if (data.language !== undefined) updateFields.language = data.language || 'en';
    if (data.status !== undefined) updateFields.status = data.status;
    if (data.variables !== undefined) updateFields.variables = data.variables ? JSON.stringify(data.variables) : null;
    if (data.mediaUrl !== undefined) updateFields.media_url = data.mediaUrl || null;
    if (data.mediaType !== undefined) updateFields.media_type = data.mediaType || null;

    await db.collection('templates').updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
    return await getTemplate(id);
  } catch (e) {
    return null;
  }
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const db = getDb();
  try {
    const r = await db.collection('templates').deleteOne({ _id: new ObjectId(id) });
    return (r.deletedCount || 0) > 0;
  } catch (e) {
    return false;
  }
}

