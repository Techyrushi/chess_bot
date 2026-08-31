import { MongoClient, ObjectId } from 'mongodb';

const dbUri = process.env.DB_URI || 'mongodb://localhost:27017/whatsapp-campaign';
const dbName = process.env.DB_NAME || 'whatsapp-campaign';

console.log('[TEST] Connecting...');
const client = new MongoClient(dbUri);
await client.connect();
const db = client.db(dbName);
console.log('[TEST] Connected to database:', dbName);

const page = 1;
const perPage = 50;

const matchFilter = {};

const total = await db.collection('contacts').countDocuments(matchFilter);
console.log('[TEST] Total contacts in DB:', total);

const rawContacts = await db.collection('contacts')
  .find(matchFilter)
  .sort({ created_at: -1 })
  .skip(0)
  .limit(perPage)
  .toArray();

console.log('[TEST] Raw contacts length:', rawContacts.length);

const contacts = [];
for (const raw of rawContacts) {
  const mapped = { id: raw._id.toString(), ...raw };
  delete mapped._id;
  
  // Get memberships
  const memberships = await db.collection('contact_list_members').find({ contact_id: mapped.id }).toArray();
  const listIds = memberships.map(m => {
    try { return m.list_id; } catch(e) { return null; }
  }).filter(Boolean);
  
  let listNames = '';
  if (listIds.length > 0) {
    const objectIds = listIds.map(id => {
      try { return new ObjectId(id); } catch(e) { return null; }
    }).filter(Boolean);
    const listsDoc = await db.collection('contact_lists').find({ _id: { $in: objectIds } }).toArray();
    listNames = listsDoc.map(l => l.name).join(', ');
  }
  contacts.push({ ...mapped, lists: listNames || undefined });
}

console.log('[TEST] Processed contacts:', contacts);
await client.close();
process.exit(0);
