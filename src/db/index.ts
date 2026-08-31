import { MongoClient, Db } from 'mongodb';

const uri = process.env.DB_URI || (import.meta && (import.meta as any).env && (import.meta as any).env.DB_URI) || 'mongodb://localhost:27017/whatsapp-campaign';
const client = new MongoClient(uri);

const dbName = process.env.DB_NAME || (import.meta && (import.meta as any).env && (import.meta as any).env.DB_NAME) || undefined;
// Top-level await to connect synchronously on module import
await client.connect();
const dbInstance = client.db(dbName);

export function getDb(): Db {
  return dbInstance;
}

export async function initDb() {
  const db = getDb();
  
  // Set up indexes
  await db.collection('admins').createIndex({ email: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ expires_at: 1 });
  await db.collection('sessions').createIndex({ admin_id: 1 });
  await db.collection('contacts').createIndex({ phone: 1 }, { unique: true });
  await db.collection('contacts').createIndex({ opted_out: 1 });
  await db.collection('contact_lists').createIndex({ name: 1 });
  await db.collection('contact_list_members').createIndex({ list_id: 1, contact_id: 1 }, { unique: true });
  await db.collection('contact_list_members').createIndex({ contact_id: 1 });
  await db.collection('templates').createIndex({ name: 1 });
  await db.collection('campaigns').createIndex({ status: 1 });
  await db.collection('campaigns').createIndex({ created_at: 1 });
  await db.collection('messages').createIndex({ campaign_id: 1 });
  await db.collection('messages').createIndex({ contact_id: 1 });
  await db.collection('messages').createIndex({ status: 1 });
  await db.collection('messages').createIndex({ sid: 1 });
  await db.collection('messages').createIndex({ phone: 1 });
  await db.collection('incoming_messages').createIndex({ from_phone: 1 });
  await db.collection('incoming_messages').createIndex({ is_read: 1 });
  await db.collection('incoming_messages').createIndex({ received_at: 1 });
  await db.collection('incoming_messages').createIndex({ sid: 1 });
  await db.collection('opt_outs').createIndex({ phone: 1 }, { unique: true });
  await db.collection('audit_logs').createIndex({ admin_id: 1 });
  await db.collection('audit_logs').createIndex({ action: 1 });
  await db.collection('audit_logs').createIndex({ created_at: 1 });
  await db.collection('settings').createIndex({ key: 1 }, { unique: true });
  
  return db;
}

// Utility helper to map MongoDB _id to id string
export function mapDoc<T = any>(doc: any): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest } as unknown as T;
}

export default { getDb, initDb, mapDoc };
