require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const twilio = require('twilio');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
const { getAdminNotificationTargets } = require('./notification-utils');

const app = express();
const port = Number(process.env.PORT || 4321);
const upload = multer({ limits: { fileSize: Number(process.env.MAX_UPLOAD_SIZE || 25000000) } });
const campaigns = new Map();
const isVercel = Boolean(process.env.VERCEL);
const logDirectory = isVercel ? '/tmp/sendroom-logs' : path.join(__dirname, 'logs');
const logFile = path.join(logDirectory, 'campaign.log');
const dataDirectory = path.join(__dirname, 'data');
const templateFile = path.join(dataDirectory, 'templates.json');
const mongoUri = process.env.DB_URI || '';
const mongoDbName = process.env.DB_NAME || 'whatsapp-campaign';
const mongoServerSelectionTimeoutMS = Number(process.env.DB_SERVER_SELECTION_TIMEOUT_MS || 5000);
let mongoClient = null;
let mongoDb = null;

async function connectMongo() {
  if (!mongoUri) {
    return null;
  }

  try {
    mongoClient = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: mongoServerSelectionTimeoutMS,
      connectTimeoutMS: mongoServerSelectionTimeoutMS,
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db(mongoDbName);
    await mongoDb.collection('settings').createIndex({ key: 1 }, { unique: true });
    await mongoDb.collection('templates').createIndex({ sid: 1 }, { unique: true });
    await mongoDb.collection('logs').createIndex({ timestamp: -1 });
    await mongoDb.collection('sent_results').createIndex({ campaignId: 1, contact: 1 }, { unique: false });
    await mongoDb.collection('campaign_analytics').createIndex({ campaignId: 1 }, { unique: true });
    await syncMongoSettingsFromEnv();
    await reconcileStoredResults();
    console.log(`MongoDB connected: ${mongoDbName}`);
    return mongoDb;
  } catch (error) {
    console.warn('MongoDB unavailable, falling back to file storage:', error.message);
    await mongoClient?.close().catch(() => {});
    mongoClient = null;
    mongoDb = null;
    return null;
  }
}

async function syncMongoSettingsFromEnv() {
  if (!mongoDb) return;
  const keys = [
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'SESSION_SECRET',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_WHATSAPP_NUMBER',
    'ADMIN_WHATSAPP_NUMBERS',
    'ADMIN_NOTIFICATION_TEMPLATE_SID',
    'TWILIO_WEBHOOK_SECRET',
    'DEFAULT_WHATSAPP_TEMPLATE_SID',
    'APPROVED_TEMPLATE_SIDS',
    'APP_URL',
    'SESSION_MAX_AGE'
  ];

  const values = Object.fromEntries(keys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  if (!Object.keys(values).length) return;

  const settingCollection = mongoDb.collection('settings');
  await Promise.all(Object.entries(values).map(([key, value]) => settingCollection.updateOne(
    { key },
    { $set: { key, value, updatedAt: new Date() } },
    { upsert: true }
  )));

  const stored = await settingCollection.find({ key: { $in: keys } }).toArray();
  for (const item of stored) {
    if (item.value !== undefined && item.value !== null) process.env[item.key] = String(item.value);
  }
}

async function reconcileStoredResults() {
  if (!mongoDb) return;
  const logs = await mongoDb.collection('logs').find({ type: { $in: ['message_sent', 'message_failed', 'test_message_sent'] } }).toArray();
  const byTimestamp = new Map(logs.map(log => [log.timestamp, log]));
  const results = await mongoDb.collection('sent_results').find({}).toArray();
  await Promise.all(results.map(result => {
    const log = byTimestamp.get(result.timestamp);
    if (!log) return null;
    return mongoDb.collection('sent_results').updateOne(
      { _id: result._id },
      { $set: { templateSid: log.templateSid || result.templateSid || '', status: log.status || result.status || 'sent', type: log.type } }
    );
  }));
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const number = process.env.TWILIO_WHATSAPP_NUMBER;
  const enabled = Boolean(accountSid && authToken && number);
  const client = enabled ? twilio(accountSid, authToken) : null;
  return { enabled, client };
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const mongoReady = connectMongo();
app.use('/api', async (req, res, next) => {
  await mongoReady;
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, runtime: isVercel ? 'vercel' : 'node', database: mongoDb ? 'mongodb' : 'local-file' }));

async function writeLog(type, details) {
  const payload = { timestamp: new Date().toISOString(), type, ...details };

  if (mongoDb) {
    try {
      await mongoDb.collection('logs').insertOne({ ...payload, createdAt: new Date() });
      if (type === 'message_sent' || type === 'message_failed' || type === 'test_message_sent') {
        await mongoDb.collection('sent_results').insertOne({
          timestamp: payload.timestamp,
          type,
          campaignId: payload.campaignId || 'test',
          contact: payload.contact,
          templateSid: payload.templateSid || details.templateSid || payload.sid || '',
          status: payload.status || (type === 'message_failed' ? 'failed' : 'sent'),
          sid: payload.sid || '',
          createdAt: new Date(),
        });
      }
      if (type === 'campaign_completed') {
        await mongoDb.collection('campaign_analytics').updateOne(
          { campaignId: payload.campaignId },
          { $set: { campaignId: payload.campaignId, sent: Number(payload.sent || 0), failed: Number(payload.failed || 0), status: payload.status || 'completed', total: Number(payload.total || 0), templateSid: payload.templateSid || '', updatedAt: new Date() } },
          { upsert: true }
        );
      }
      return;
    } catch (error) {
      console.error('Could not write MongoDB log:', error.message);
    }
  }

  try {
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify(payload)}\n`);
  } catch (error) {
    console.error('Could not write activity log:', error.message);
  }
}

function createAuthToken(email) {
  const payload = Buffer.from(JSON.stringify({ email, expiresAt: Date.now() + Number(process.env.SESSION_MAX_AGE || 86400000) })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'change-this-session-secret').update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function getAuthToken(req) {
  const cookies = String(req.headers.cookie || '').split(';').map(value => value.trim());
  return cookies.find(value => value.startsWith('sendroom_auth='))?.slice('sendroom_auth='.length);
}

function getAdmin(req) {
  const token = getAuthToken(req);
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'change-this-session-secret').update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.expiresAt > Date.now() ? data : null;
  } catch { return null; }
}

function requireAuth(req, res, next) {
  const admin = getAdmin(req);
  if (admin) { req.admin = admin; return next(); }
  res.status(401).json({ error: 'Authentication required.' });
}

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const validEmail = email && email.toLowerCase() === String(process.env.ADMIN_EMAIL || '').toLowerCase();
  const validPassword = password && password === process.env.ADMIN_PASSWORD;
  if (!validEmail || !validPassword) return res.status(401).json({ error: 'Invalid admin email or password.' });
  await writeLog('login', { email: process.env.ADMIN_EMAIL });
  res.setHeader('Set-Cookie', `sendroom_auth=${createAuthToken(process.env.ADMIN_EMAIL)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(Number(process.env.SESSION_MAX_AGE || 86400000) / 1000)}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ email: process.env.ADMIN_EMAIL });
});

app.post('/api/auth/logout', (req, res) => { res.setHeader('Set-Cookie', 'sendroom_auth=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => { const admin = getAdmin(req); res.json({ authenticated: Boolean(admin), email: admin?.email }); });
app.use('/api', requireAuth);

function normalizeNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^\d{8,15}$/.test(digits)) return `+${digits}`;
  return null;
}

async function readTemplateRecords() {
  if (mongoDb) {
    try {
      const templates = await mongoDb.collection('templates').find({}).sort({ createdAt: 1 }).toArray();
      return templates.map(template => ({ sid: template.sid, name: template.name }));
    } catch (error) {
      console.error('Could not load templates from MongoDB:', error.message);
    }
  }

  let saved = [];
  if (fs.existsSync(templateFile)) {
    try { saved = JSON.parse(fs.readFileSync(templateFile, 'utf8')); } catch { saved = []; }
  }
  return Array.isArray(saved) ? saved : [];
}

async function saveTemplateRecords(templates) {
  if (mongoDb) {
    try {
      await mongoDb.collection('templates').deleteMany({});
      if (templates.length) {
        await mongoDb.collection('templates').insertMany(templates.map(template => ({ ...template, createdAt: new Date() })));
      }
      return;
    } catch (error) {
      console.error('Could not save templates to MongoDB:', error.message);
    }
  }

  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(templateFile, JSON.stringify(templates, null, 2));
}

async function approvedTemplates() {
  const configured = (process.env.APPROVED_TEMPLATE_SIDS || process.env.DEFAULT_WHATSAPP_TEMPLATE_SID || '').split(',').map(sid => sid.trim()).filter(Boolean);
  const saved = await readTemplateRecords();
  const merged = [...configured, ...saved.map(template => template.sid)].filter((sid, index, list) => sid && list.indexOf(sid) === index);
  return merged.map((sid, index) => saved.find(template => template.sid === sid) || { sid, name: `Approved template ${index + 1}` });
}

async function isApprovedTemplate(sid) {
  const templates = await approvedTemplates();
  return templates.some(template => template.sid === sid);
}

function parseContacts(buffer) {
  const rows = parse(buffer.toString('utf8'), { skip_empty_lines: true, relax_column_count: true });
  const seen = new Set();
  return rows.map(row => normalizeNumber(row[0])).filter(number => {
    if (!number || seen.has(number)) return false;
    seen.add(number);
    return true;
  });
}

async function sendTemplate(to, templateSid, variables = {}) {
  const twilioConfig = getTwilioClient();
  if (!twilioConfig.enabled || process.env.DRY_RUN === 'true') {
    return { sid: `dry_${crypto.randomBytes(6).toString('hex')}`, status: 'dry-run' };
  }
  return twilioConfig.client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:${to}`,
    contentSid: templateSid,
    contentVariables: Object.keys(variables).length ? JSON.stringify(variables) : undefined
  });
}

async function notifyAdminCampaignResult(campaign) {
  const targets = getAdminNotificationTargets(process.env.ADMIN_WHATSAPP_NUMBERS || '919370962001,918446225859');
  const notificationTemplateSid = String(process.env.ADMIN_NOTIFICATION_TEMPLATE_SID || '').trim();

  if (!targets.length || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_NUMBER || process.env.DRY_RUN === 'true') {
    return { skipped: true, reason: 'Twilio admin notifications are disabled.' };
  }

  const template = (await approvedTemplates()).find(item => item.sid === campaign.templateSid);
  const templateLabel = template?.name ? `${template.name} (${campaign.templateSid})` : campaign.templateSid;
  const message = `Campaign ${campaign.id} completed. Template used: ${templateLabel}. ${campaign.sent} message(s) sent successfully and ${campaign.failed} failed. Total contacts processed: ${campaign.contacts.length}.`;
  if (!notificationTemplateSid) {
    await Promise.all(targets.map(target => writeLog('admin_notification_failed', {
      campaignId: campaign.id,
      contact: target,
      error: 'ADMIN_NOTIFICATION_TEMPLATE_SID is required for WhatsApp notifications outside the 24-hour customer-care window.',
      message,
    })));
    return { skipped: true, reason: 'Admin notification template is not configured.' };
  }
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const deliveries = await Promise.all(targets.map(async target => {
    try {
      const result = await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: target,
        contentSid: notificationTemplateSid,
        contentVariables: JSON.stringify({
          1: campaign.id,
          2: templateLabel,
          3: String(campaign.sent),
          4: String(campaign.failed),
          5: String(campaign.contacts.length),
        }),
      });
      await writeLog('admin_notification_sent', { campaignId: campaign.id, contact: target, status: result.status || 'sent', message });
      return { target, sent: true, sid: result.sid };
    } catch (error) {
      await writeLog('admin_notification_failed', { campaignId: campaign.id, contact: target, error: error.message, message });
      return { target, sent: false, error: error.message };
    }
  }));
  return { skipped: false, deliveries };
}

async function processCampaign(campaign) {
  campaign.status = 'sending';
  await writeLog('campaign_started', { campaignId: campaign.id, total: campaign.contacts.length, templateSid: campaign.templateSid, batchSize: campaign.batchSize });
  for (let index = 0; index < campaign.contacts.length; index += campaign.batchSize) {
    const batch = campaign.contacts.slice(index, index + campaign.batchSize);
    campaign.currentBatch = Math.floor(index / campaign.batchSize) + 1;
    for (const contact of batch) {
      try {
        const result = await sendTemplate(contact, campaign.templateSid);
        campaign.sent += 1;
        campaign.results.push({ contact, status: result.status || 'sent', sid: result.sid });
        await writeLog('message_sent', { campaignId: campaign.id, contact, sid: result.sid, status: result.status || 'sent', templateSid: campaign.templateSid });
      } catch (error) {
        campaign.failed += 1;
        campaign.results.push({ contact, status: 'failed', error: error.message });
        await writeLog('message_failed', { campaignId: campaign.id, contact, error: error.message, templateSid: campaign.templateSid });
      }
      const minimum = Number(process.env.SEND_DELAY_MIN_MS || 1000);
      const maximum = Number(process.env.SEND_DELAY_MAX_MS || 3000);
      const delay = minimum + Math.floor(Math.random() * Math.max(1, maximum - minimum));
      if (delay > 0 && campaign.contacts.length > 1) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  campaign.status = campaign.failed ? 'completed_with_errors' : 'completed';
  await writeLog('campaign_completed', { campaignId: campaign.id, status: campaign.status, sent: campaign.sent, failed: campaign.failed, total: campaign.contacts.length, templateSid: campaign.templateSid });

  if (campaign.sent + campaign.failed === campaign.contacts.length) {
    await notifyAdminCampaignResult(campaign);
  }
}

async function getStoredLogs() {
  if (mongoDb) {
    try {
      const logs = await mongoDb.collection('logs').find({}).sort({ createdAt: -1 }).limit(500).toArray();
      return logs.map(log => ({ ...log, _id: undefined, createdAt: undefined }));
    } catch (error) {
      console.error('Could not read MongoDB logs:', error.message);
    }
  }

  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).slice(-500).reverse().map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function buildResultsFromLogs(logs) {
  return (logs || [])
    .filter(log => log.type === 'message_sent' || log.type === 'test_message_sent' || log.type === 'message_failed')
    .slice(0, 200)
    .map(log => ({
      timestamp: log.timestamp,
      contact: log.contact,
      campaignId: log.campaignId || 'test',
      templateSid: log.templateSid || log.sid || '-',
      status: log.status || (log.type === 'message_failed' ? 'failed' : 'sent'),
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function buildAnalyticsFromLogs(logs) {
  const campaignMap = new Map();
  for (const log of logs || []) {
    if (!log.campaignId) continue;
    const item = campaignMap.get(log.campaignId) || { id: log.campaignId, sent: 0, failed: 0, status: 'queued', total: 0 };
    if (log.type === 'message_sent') item.sent += 1;
    if (log.type === 'message_failed') item.failed += 1;
    if (log.type === 'campaign_completed') item.status = log.status || 'completed';
    if (log.type === 'campaign_started') item.total = Number(log.total || item.total || 0);
    campaignMap.set(log.campaignId, item);
  }

  const recentCampaigns = [...campaignMap.values()].slice(0, 10).map(campaign => ({
    id: campaign.id,
    sent: campaign.sent,
    failed: campaign.failed,
    status: campaign.status,
  }));

  const totalSent = (logs || []).filter(log => log.type === 'message_sent').length;
  const totalFailed = (logs || []).filter(log => log.type === 'message_failed').length;
  const total = totalSent + totalFailed;

  return {
    totalCampaigns: recentCampaigns.length,
    totalSent,
    totalFailed,
    successRate: total ? Number(((totalSent / total) * 100).toFixed(1)) : 0,
    recentCampaigns,
  };
}

app.get('/api/templates', async (req, res) => {
  const twilioConfig = getTwilioClient();
  res.json({ templates: await approvedTemplates(), twilioEnabled: twilioConfig.enabled, dryRun: process.env.DRY_RUN === 'true' });
});

app.post('/api/templates', async (req, res) => {
  const sid = String(req.body.sid || '').trim();
  const name = String(req.body.name || '').trim();
  if (!/^HX[a-zA-Z0-9]{32}$/.test(sid)) return res.status(400).json({ error: 'Enter a valid Twilio Content SID beginning with HX.' });
  const existing = await approvedTemplates();
  if (existing.some(template => template.sid === sid)) return res.status(409).json({ error: 'That template SID is already approved.' });
  const templates = await readTemplateRecords();
  const next = [...templates, { sid, name: name || `Approved template ${templates.length + 1}` }];
  await saveTemplateRecords(next);
  await writeLog('template_added', { sid, name: next.at(-1).name });
  res.status(201).json({ template: next.at(-1) });
});

app.delete('/api/templates/:sid', async (req, res) => {
  const sid = req.params.sid;
  if ((process.env.APPROVED_TEMPLATE_SIDS || process.env.DEFAULT_WHATSAPP_TEMPLATE_SID || '').split(',').map(value => value.trim()).includes(sid)) return res.status(400).json({ error: 'Environment-configured templates cannot be removed here.' });
  const templates = await readTemplateRecords();
  const next = templates.filter(template => template.sid !== sid);
  if (next.length === templates.length) return res.status(404).json({ error: 'Template not found.' });
  await saveTemplateRecords(next);
  await writeLog('template_removed', { sid });
  res.json({ ok: true });
});

app.post('/api/contacts/preview', upload.single('contacts'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please upload a CSV file.' });
  try {
    const rows = parse(req.file.buffer.toString('utf8'), { skip_empty_lines: true, relax_column_count: true });
    const contacts = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const raw = String(row[0] ?? '').trim();
      if (index === 0 && /phone|mobile|number|contact/i.test(raw)) return;
      const number = normalizeNumber(raw);
      if (number && !seen.has(number)) { seen.add(number); contacts.push({ number, valid: true }); }
      else if (raw) contacts.push({ number: raw, valid: false });
    });
    res.json({ contacts, validCount: contacts.filter(contact => contact.valid).length, invalidCount: contacts.filter(contact => !contact.valid).length });
  } catch (error) { res.status(400).json({ error: `Could not read CSV: ${error.message}` }); }
});

app.post('/api/campaigns/send', async (req, res) => {
  const { contacts, templateSid, batchSize } = req.body;
  const cleanContacts = Array.isArray(contacts) ? [...new Set(contacts.map(normalizeNumber).filter(Boolean))] : [];
  const size = Number(batchSize);
  if (!cleanContacts.length) return res.status(400).json({ error: 'Add at least one valid contact.' });
  if (!(await isApprovedTemplate(templateSid))) return res.status(400).json({ error: 'Choose an approved template SID.' });
  if (!Number.isInteger(size) || size < 1 || size > 5000) return res.status(400).json({ error: 'Batch size must be between 1 and 5000.' });
  const id = `cmp_${Date.now().toString(36)}`;
  const campaign = { id, contacts: cleanContacts, templateSid, batchSize: size, status: 'queued', currentBatch: 0, sent: 0, failed: 0, results: [] };
  campaigns.set(id, campaign);
  processCampaign(campaign).catch(error => { campaign.status = 'failed'; campaign.error = error.message; });
  res.status(202).json({ campaignId: id, total: cleanContacts.length, batches: Math.ceil(cleanContacts.length / size), status: campaign.status });
});

app.get('/api/campaigns/results', async (req, res) => {
  try {
    if (mongoDb) {
      const results = await mongoDb.collection('sent_results').find({}).sort({ createdAt: -1 }).limit(200).toArray();
      const normalized = results.map(item => ({
        timestamp: item.timestamp,
        contact: item.contact,
        campaignId: item.campaignId,
        templateSid: item.templateSid,
        status: item.status || 'sent',
      }));
      if (normalized.length) return res.json({ results: normalized });
    }

    const logs = await getStoredLogs();
    res.json({ results: buildResultsFromLogs(logs) });
  } catch (error) {
    console.error('Failed to read campaign results:', error.message);
    res.status(500).json({ error: 'Could not load sent numbers.' });
  }
});

app.get('/api/campaigns/:id', (req, res) => {
  const campaign = campaigns.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  res.json({ ...campaign, contacts: undefined, results: campaign.results.slice(-100) });
});

app.get('/api/logs', async (req, res) => {
  const logs = await getStoredLogs();
  res.json({ logs: logs.slice(0, 200) });
});

app.get('/api/analytics', async (req, res) => {
  try {
    if (mongoDb) {
      const analytics = await mongoDb.collection('campaign_analytics').find({}).sort({ updatedAt: -1 }).toArray();
      const summary = analytics.reduce((acc, item) => {
        acc.totalCampaigns += 1;
        acc.totalSent += Number(item.sent || 0);
        acc.totalFailed += Number(item.failed || 0);
        acc.recentCampaigns.push({
          id: item.campaignId,
          sent: Number(item.sent || 0),
          failed: Number(item.failed || 0),
          status: item.status || 'completed',
        });
        return acc;
      }, { totalCampaigns: 0, totalSent: 0, totalFailed: 0, recentCampaigns: [] });

      const total = summary.totalSent + summary.totalFailed;
      if (summary.totalCampaigns || summary.totalSent || summary.totalFailed) {
        return res.json({
          totalCampaigns: summary.totalCampaigns,
          totalSent: summary.totalSent,
          totalFailed: summary.totalFailed,
          successRate: total ? Number(((summary.totalSent / total) * 100).toFixed(1)) : 0,
          recentCampaigns: summary.recentCampaigns.slice(0, 10),
        });
      }
    }

    const logs = await getStoredLogs();
    const summaryFromLogs = buildAnalyticsFromLogs(logs);
    res.json(summaryFromLogs);
  } catch (error) {
    console.error('Failed to read analytics:', error.message);
    res.status(500).json({ error: 'Could not load analytics.' });
  }
});

app.delete('/api/logs', async (req, res) => {
  if (mongoDb) {
    try {
      await mongoDb.collection('logs').deleteMany({});
      await mongoDb.collection('sent_results').deleteMany({});
      await mongoDb.collection('campaign_analytics').deleteMany({});
      return res.json({ ok: true });
    } catch (error) {
      console.error('Could not clear MongoDB logs:', error.message);
    }
  }

  if (fs.existsSync(logFile)) fs.writeFileSync(logFile, '');
  res.json({ ok: true });
});

app.post('/api/messages/test', async (req, res) => {
  const { to, templateSid, variables = {} } = req.body;
  const number = normalizeNumber(to);
  if (!number) return res.status(400).json({ error: 'Enter a valid international mobile number, for example +919876543210.' });
  if (!(await isApprovedTemplate(templateSid))) return res.status(400).json({ error: 'Choose an approved template SID.' });
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return res.status(400).json({ error: 'Template variables must be a JSON object.' });
  try {
    const message = await sendTemplate(number, templateSid, variables);
    await writeLog('test_message_sent', { contact: number, templateSid, sid: message.sid, status: message.status || 'sent' });
    res.json({ messageSid: message.sid, status: message.status || 'sent' });
  } catch (error) {
    res.status(502).json({ error: `Twilio rejected the message: ${error.message}` });
  }
});

mongoReady.then(() => {
  if (!isVercel) {
    const twilioConfig = getTwilioClient();
    app.listen(port, () => console.log(`Sendroom listening at http://localhost:${port} (${twilioConfig.enabled ? 'Twilio enabled' : 'dry-run until Twilio credentials are configured'})`));
  }
});

module.exports = app;
