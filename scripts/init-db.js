import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const dbUri = process.env.DB_URI || 'mongodb://localhost:27017/whatsapp-campaign';

const uploadDir = process.env.UPLOAD_DIR || path.join(projectRoot, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

console.log('[DB] Connecting to MongoDB...');
const client = new MongoClient(dbUri);
await client.connect();
const dbName = process.env.DB_NAME || 'whatsapp-campaign';
const db = client.db(dbName);
console.log('[DB] Connected successfully');

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

const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const adminName = 'System Administrator';

const existingAdmin = await db.collection('admins').findOne({ email: adminEmail });

if (!existingAdmin) {
  const saltRounds = 12;
  const passwordHash = bcrypt.hashSync(adminPassword, saltRounds);
  const now = Date.now();
  await db.collection('admins').insertOne({
    email: adminEmail,
    password_hash: passwordHash,
    name: adminName,
    created_at: now,
    updated_at: now
  });
  console.log(`\x1b[32m[DB]\x1b[0m Created admin user: ${adminEmail}`);
} else {
  console.log(`\x1b[36m[DB]\x1b[0m Admin user already exists: ${adminEmail}`);
}

const defaultSettings = [
  { key: 'twilio_account_sid', value: process.env.TWILIO_ACCOUNT_SID || '' },
  { key: 'twilio_auth_token', value: process.env.TWILIO_AUTH_TOKEN || '' },
  { key: 'twilio_whatsapp_number', value: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886' },
  { key: 'twilio_webhook_secret', value: process.env.TWILIO_WEBHOOK_SECRET || '' },
  { key: 'send_delay_min_ms', value: process.env.SEND_DELAY_MIN_MS || '1000' },
  { key: 'send_delay_max_ms', value: process.env.SEND_DELAY_MAX_MS || '3000' },
  { key: 'max_retries', value: process.env.MAX_RETRIES || '3' },
];

for (const s of defaultSettings) {
  await db.collection('settings').updateOne(
    { key: s.key },
    { 
      $set: { 
        value: s.value,
        updated_at: Date.now()
      } 
    },
    { upsert: true }
  );
}

console.log('\x1b[32m[DB]\x1b[0m Default settings initialized');

const expiredDeleted = await db.collection('sessions').deleteMany({ expires_at: { $lt: Date.now() } });
if (expiredDeleted.deletedCount > 0) {
  console.log(`\x1b[36m[DB]\x1b[0m Cleaned up ${expiredDeleted.deletedCount} expired sessions`);
}

console.log('\x1b[32m[DB]\x1b[0m Database initialization complete!');
console.log('');
console.log('Login credentials:');
console.log(`  Email: ${adminEmail}`);
console.log(`  Password: ${adminPassword}`);
console.log('');

await client.close();
process.exit(0);
