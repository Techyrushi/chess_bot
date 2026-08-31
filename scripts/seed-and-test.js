import { MongoClient } from 'mongodb';
import twilio from 'twilio';

const dbUri = process.env.DB_URI || 'mongodb://localhost:27017/whatsapp-campaign';
const toNumber = 'whatsapp:+918446225859';
const mediaUrl = 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?q=80&w=1000';

const templateBody = `🏆 CHAMPIONS ACADEMY
Where Champions Begin! 🌟

♟️ Chess • 🧮 Abacus • ✍️ Handwriting
🎯 Ages 5+ | Online & Offline

🎁 FREE Demo Class!
✨ Expert Trainers • Small Batches • Personal Attention

📍 Indira Nagar | Pawan Nagar | Gangapur Road | Deolali Camp

📞 Admissions Open: 9370962001 / 7249699301
🏆 Enroll Now — Limited Seats!`;

console.log('[TEST] Connecting to MongoDB to seed template and read Twilio settings...');
const client = new MongoClient(dbUri);
await client.connect();
const dbName = process.env.DB_NAME || 'whatsapp-campaign';
const db = client.db(dbName);
console.log('[TEST] Connected to MongoDB');

// 1. Seed the template in DB
const now = Date.now();
const templateName = 'champions_academy';
await db.collection('templates').updateOne(
  { name: templateName },
  {
    $set: {
      name: templateName,
      sid: null,
      body: templateBody,
      category: 'marketing',
      language: 'hi',
      status: 'approved',
      media_url: mediaUrl,
      media_type: 'image/jpeg',
      updated_at: now
    },
    $setOnInsert: {
      created_at: now
    }
  },
  { upsert: true }
);
console.log('[TEST] Champions Academy template seeded in MongoDB');

// 2. Fetch Twilio settings from DB
const accountSidSetting = await db.collection('settings').findOne({ key: 'twilio_account_sid' });
const authTokenSetting = await db.collection('settings').findOne({ key: 'twilio_auth_token' });
const whatsappNumberSetting = await db.collection('settings').findOne({ key: 'twilio_whatsapp_number' });

const accountSid = accountSidSetting?.value || process.env.TWILIO_ACCOUNT_SID;
const authToken = authTokenSetting?.value || process.env.TWILIO_AUTH_TOKEN;
const fromNumber = whatsappNumberSetting?.value || process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+917397956201';

if (!accountSid || !authToken) {
  console.error('[TEST] Error: Twilio credentials not found in MongoDB or environment variables');
  await client.close();
  process.exit(1);
}

console.log('[TEST] Initializing Twilio client with credentials from DB...');
const twilioClient = twilio(accountSid, authToken);

console.log(`[TEST] Sending WhatsApp message to ${toNumber} from ${fromNumber}...`);
try {
  const message = await twilioClient.messages.create({
    from: fromNumber,
    to: toNumber,
    body: templateBody,
    mediaUrl: [mediaUrl]
  });
  console.log('[TEST] Message sent successfully!');
  console.log('[TEST] Message SID:', message.sid);
  console.log('[TEST] Message Status:', message.status);
} catch (error) {
  console.error('[TEST] Failed to send message:', error);
}

await client.close();
process.exit(0);
