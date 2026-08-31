import { MongoClient } from 'mongodb';

const dbUri = process.env.DB_URI || 'mongodb://localhost:27017/whatsapp-campaign';
const dbName = process.env.DB_NAME || 'whatsapp-campaign';

console.log('[STATS] Connecting to MongoDB...');
const client = new MongoClient(dbUri);
await client.connect();
const db = client.db(dbName);
console.log('[STATS] Connected successfully to db:', dbName);

const totalCampaigns = await db.collection('campaigns').countDocuments();
const totalContacts = await db.collection('contacts').countDocuments({ opted_out: 0 });
const activeCampaigns = await db.collection('campaigns').countDocuments({
  status: { $in: ['queued', 'sending', 'paused'] }
});
const optOuts = await db.collection('opt_outs').countDocuments();
const templates = await db.collection('templates').countDocuments();

console.log('[STATS] Counts from DB:');
console.log('  Total Campaigns:', totalCampaigns);
console.log('  Total Contacts:', totalContacts);
console.log('  Active Campaigns:', activeCampaigns);
console.log('  Opt-outs:', optOuts);
console.log('  Templates:', templates);

const campaignsList = await db.collection('campaigns').find({}).toArray();
console.log('[STATS] Campaigns:', campaignsList);

const templatesList = await db.collection('templates').find({}).toArray();
console.log('[STATS] Templates:', templatesList);

await client.close();
process.exit(0);
