import { MongoClient, ObjectId } from 'mongodb';

const dbUri = process.env.DB_URI || 'mongodb://localhost:27017/whatsapp-campaign';

console.log('[SEED] Connecting to MongoDB...');
const client = new MongoClient(dbUri);
await client.connect();
const dbName = process.env.DB_NAME || 'whatsapp-campaign';
const db = client.db(dbName);
console.log('[SEED] Connected successfully');

const sampleContacts = [
  { phone: '+14155238886', name: 'Demo User 1', company: 'Acme Inc', city: 'San Francisco', email: 'demo1@example.com', opted_out: 0 },
  { phone: '+15555550100', name: 'Jane Smith', company: 'Globex Corp', city: 'New York', email: 'jane@example.com', opted_out: 0 },
  { phone: '+15555550101', name: 'John Doe', company: 'Initech', city: 'Austin', email: 'john@example.com', opted_out: 0 },
  { phone: '+15555550102', name: 'Bob Jones', company: 'Umbrella', city: 'Seattle', email: 'bob@example.com', opted_out: 0 },
  { phone: '+15555550103', name: 'Alice Lee', company: 'Stark Industries', city: 'Los Angeles', email: 'alice@example.com', opted_out: 0 },
  { phone: '+15555550104', name: 'Charlie Brown', company: 'Wonka Co', city: 'Chicago', email: 'charlie@example.com', opted_out: 0 },
  { phone: '+15555550105', name: 'Diana Prince', company: 'Wayne Ent', city: 'Miami', email: 'diana@example.com', opted_out: 0 },
  { phone: '+15555550106', name: 'Eve Adams', company: 'Oscorp', city: 'Boston', email: 'eve@example.com', opted_out: 0 },
];

console.log('[SEED] Creating sample contacts...');
const now = Date.now();
const insertedContacts = [];

for (const c of sampleContacts) {
  // Use updateOne with upsert to avoid duplicate keys on phone
  await db.collection('contacts').updateOne(
    { phone: c.phone },
    { 
      $setOnInsert: { 
        name: c.name,
        company: c.company,
        city: c.city,
        email: c.email,
        custom_fields: null,
        opted_out: c.opted_out,
        created_at: now,
        updated_at: now
      } 
    },
    { upsert: true }
  );
  
  const doc = await db.collection('contacts').findOne({ phone: c.phone });
  if (doc) {
    insertedContacts.push(doc);
  }
}

const listName = 'Demo Contacts — Sample List';
let list = await db.collection('contact_lists').findOne({ name: listName });
if (!list) {
  const res = await db.collection('contact_lists').insertOne({
    name: listName,
    description: 'Auto-generated sample contact list with demo contacts',
    contact_count: 0,
    created_at: now,
    updated_at: now
  });
  list = { _id: res.insertedId, name: listName };
}

const listIdStr = list._id.toString();

console.log('[SEED] Linking contacts to sample list...');
for (const contact of insertedContacts) {
  const contactIdStr = contact._id.toString();
  await db.collection('contact_list_members').updateOne(
    { list_id: listIdStr, contact_id: contactIdStr },
    { $setOnInsert: { added_at: now } },
    { upsert: true }
  );
}

const memberCount = await db.collection('contact_list_members').countDocuments({ list_id: listIdStr });
await db.collection('contact_lists').updateOne(
  { _id: list._id },
  { $set: { contact_count: memberCount, updated_at: now } }
);

console.log(`[SEED] Sample list "${listName}" created/updated with ${memberCount} contacts (ID: ${listIdStr})`);

console.log('[SEED] Creating sample templates...');
const templates = [
  {
    name: 'welcome_message',
    body: 'Hello {{name}}! 👋 Thank you for your interest in {{company}}. Our team will reach out to you shortly at {{city}}.',
    language: 'en',
    category: 'marketing',
    variables: JSON.stringify(['name', 'company', 'city'])
  },
  {
    name: 'sale_announcement',
    body: 'Hi {{name}}! 🎉 Big news: {{company}} is running a 30% sale all week. Reply STOP to opt out.',
    language: 'en',
    category: 'marketing',
    variables: JSON.stringify(['name', 'company'])
  },
  {
    name: 'order_confirmation',
    body: 'Dear {{name}}, your order from {{company}} has been shipped to {{city}}. Track it via the link sent to {{email}}.',
    language: 'en',
    category: 'utility',
    variables: JSON.stringify(['name', 'company', 'city', 'email'])
  }
];

for (const t of templates) {
  await db.collection('templates').updateOne(
    { name: t.name },
    {
      $setOnInsert: {
        sid: null,
        body: t.body,
        variables: t.variables,
        category: t.category,
        language: t.language,
        status: 'approved',
        created_at: now,
        updated_at: now
      }
    },
    { upsert: true }
  );
}
console.log(`[SEED] ${templates.length} templates added/verified`);

console.log('[SEED] Creating sample campaign (draft)...');
const adminRow = await db.collection('admins').findOne({});
if (adminRow) {
  const adminIdStr = adminRow._id.toString();
  
  const sampleCampaign = {
    name: 'Sample — Spring Sale Announcement',
    contact_list_id: listIdStr,
    message_body: 'Hi {{name}}! 🌷 Spring sale at {{company}} — 25% OFF everything in {{city}} this weekend. Reply STOP to opt out.',
    use_template: 0,
    total_contacts: memberCount
  };

  const existingCampaign = await db.collection('campaigns').findOne({ name: sampleCampaign.name });
  if (!existingCampaign) {
    await db.collection('campaigns').insertOne({
      name: sampleCampaign.name,
      contact_list_id: sampleCampaign.contact_list_id,
      template_id: null,
      message_body: sampleCampaign.message_body,
      media_url: null,
      media_type: null,
      use_template: 0,
      status: 'draft',
      total_contacts: sampleCampaign.total_contacts,
      queued_count: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      failed_count: 0,
      undelivered_count: 0,
      send_delay_min: 1000,
      send_delay_max: 3000,
      max_retries: 3,
      scheduled_at: null,
      started_at: null,
      completed_at: null,
      paused_at: null,
      created_by: adminIdStr,
      created_at: now,
      updated_at: now
    });
    console.log('[SEED] Draft sample campaign created');
  } else {
    console.log('[SEED] Draft sample campaign already exists');
  }
}

console.log('\x1b[32m[SEED]\x1b[0m Seeding complete!');
await client.close();
process.exit(0);
