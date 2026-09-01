require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const twilio = require('twilio');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const port = Number(process.env.PORT || 4321);
const upload = multer({ limits: { fileSize: Number(process.env.MAX_UPLOAD_SIZE || 25000000) } });
const campaigns = new Map();
const logDirectory = path.join(__dirname, 'logs');
const logFile = path.join(logDirectory, 'campaign.log');
const dataDirectory = path.join(__dirname, 'data');
const templateFile = path.join(dataDirectory, 'templates.json');
const twilioEnabled = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER);
const twilioClient = twilioEnabled ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: Number(process.env.SESSION_MAX_AGE || 86400000) }
}));
app.use(express.static(path.join(__dirname, 'public')));

function writeLog(type, details) {
  fs.mkdirSync(logDirectory, { recursive: true });
  fs.appendFileSync(logFile, `${JSON.stringify({ timestamp: new Date().toISOString(), type, ...details })}\n`);
}

function requireAuth(req, res, next) {
  if (req.session.admin) return next();
  res.status(401).json({ error: 'Authentication required.' });
}

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const validEmail = email && email.toLowerCase() === String(process.env.ADMIN_EMAIL || '').toLowerCase();
  const validPassword = password && password === process.env.ADMIN_PASSWORD;
  if (!validEmail || !validPassword) return res.status(401).json({ error: 'Invalid admin email or password.' });
  req.session.admin = { email: process.env.ADMIN_EMAIL };
  req.session.save((error) => {
    if (error) return res.status(500).json({ error: 'Could not create an admin session.' });
    writeLog('login', { email: process.env.ADMIN_EMAIL });
    res.json({ email: process.env.ADMIN_EMAIL });
  });
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/auth/me', (req, res) => res.json({ authenticated: Boolean(req.session.admin), email: req.session.admin?.email }));
app.use('/api', requireAuth);

function normalizeNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^\d{8,15}$/.test(digits)) return `+${digits}`;
  return null;
}

function approvedTemplates() {
  const configured = (process.env.APPROVED_TEMPLATE_SIDS || process.env.DEFAULT_WHATSAPP_TEMPLATE_SID || '').split(',').map(sid => sid.trim()).filter(Boolean);
  let saved = [];
  if (fs.existsSync(templateFile)) {
    try { saved = JSON.parse(fs.readFileSync(templateFile, 'utf8')); } catch { saved = []; }
  }
  const merged = [...configured, ...saved.map(template => template.sid)].filter((sid, index, list) => sid && list.indexOf(sid) === index);
  return merged.map((sid, index) => saved.find(template => template.sid === sid) || { sid, name: `Approved template ${index + 1}` });
}

function isApprovedTemplate(sid) {
  return approvedTemplates().some(template => template.sid === sid);
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
  if (!twilioEnabled || process.env.DRY_RUN === 'true') {
    return { sid: `dry_${crypto.randomBytes(6).toString('hex')}`, status: 'dry-run' };
  }
  return twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:${to}`,
    contentSid: templateSid,
    contentVariables: Object.keys(variables).length ? JSON.stringify(variables) : undefined
  });
}

async function processCampaign(campaign) {
  campaign.status = 'sending';
  writeLog('campaign_started', { campaignId: campaign.id, total: campaign.contacts.length, templateSid: campaign.templateSid, batchSize: campaign.batchSize });
  for (let index = 0; index < campaign.contacts.length; index += campaign.batchSize) {
    const batch = campaign.contacts.slice(index, index + campaign.batchSize);
    campaign.currentBatch = Math.floor(index / campaign.batchSize) + 1;
    for (const contact of batch) {
      try {
        const result = await sendTemplate(contact, campaign.templateSid);
        campaign.sent += 1;
        campaign.results.push({ contact, status: result.status || 'sent', sid: result.sid });
        writeLog('message_sent', { campaignId: campaign.id, contact, sid: result.sid, status: result.status || 'sent' });
      } catch (error) {
        campaign.failed += 1;
        campaign.results.push({ contact, status: 'failed', error: error.message });
        writeLog('message_failed', { campaignId: campaign.id, contact, error: error.message });
      }
      const minimum = Number(process.env.SEND_DELAY_MIN_MS || 1000);
      const maximum = Number(process.env.SEND_DELAY_MAX_MS || 3000);
      const delay = minimum + Math.floor(Math.random() * Math.max(1, maximum - minimum));
      if (delay > 0 && campaign.contacts.length > 1) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  campaign.status = campaign.failed ? 'completed_with_errors' : 'completed';
  writeLog('campaign_completed', { campaignId: campaign.id, status: campaign.status, sent: campaign.sent, failed: campaign.failed });
}

app.get('/api/templates', (req, res) => res.json({ templates: approvedTemplates(), twilioEnabled, dryRun: process.env.DRY_RUN === 'true' }));

app.post('/api/templates', (req, res) => {
  const sid = String(req.body.sid || '').trim();
  const name = String(req.body.name || '').trim();
  if (!/^HX[a-zA-Z0-9]{32}$/.test(sid)) return res.status(400).json({ error: 'Enter a valid Twilio Content SID beginning with HX.' });
  if (approvedTemplates().some(template => template.sid === sid)) return res.status(409).json({ error: 'That template SID is already approved.' });
  fs.mkdirSync(dataDirectory, { recursive: true });
  const templates = fs.existsSync(templateFile) ? JSON.parse(fs.readFileSync(templateFile, 'utf8')) : [];
  templates.push({ sid, name: name || `Approved template ${templates.length + 1}` });
  fs.writeFileSync(templateFile, JSON.stringify(templates, null, 2));
  writeLog('template_added', { sid, name: templates.at(-1).name });
  res.status(201).json({ template: templates.at(-1) });
});

app.delete('/api/templates/:sid', (req, res) => {
  const sid = req.params.sid;
  if ((process.env.APPROVED_TEMPLATE_SIDS || process.env.DEFAULT_WHATSAPP_TEMPLATE_SID || '').split(',').map(value => value.trim()).includes(sid)) return res.status(400).json({ error: 'Environment-configured templates cannot be removed here.' });
  const templates = fs.existsSync(templateFile) ? JSON.parse(fs.readFileSync(templateFile, 'utf8')) : [];
  const next = templates.filter(template => template.sid !== sid);
  if (next.length === templates.length) return res.status(404).json({ error: 'Template not found.' });
  fs.writeFileSync(templateFile, JSON.stringify(next, null, 2));
  writeLog('template_removed', { sid });
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

app.post('/api/campaigns/send', (req, res) => {
  const { contacts, templateSid, batchSize } = req.body;
  const cleanContacts = Array.isArray(contacts) ? [...new Set(contacts.map(normalizeNumber).filter(Boolean))] : [];
  const size = Number(batchSize);
  if (!cleanContacts.length) return res.status(400).json({ error: 'Add at least one valid contact.' });
  if (!isApprovedTemplate(templateSid)) return res.status(400).json({ error: 'Choose an approved template SID.' });
  if (!Number.isInteger(size) || size < 1 || size > 5000) return res.status(400).json({ error: 'Batch size must be between 1 and 5000.' });
  const id = `cmp_${Date.now().toString(36)}`;
  const campaign = { id, contacts: cleanContacts, templateSid, batchSize: size, status: 'queued', currentBatch: 0, sent: 0, failed: 0, results: [] };
  campaigns.set(id, campaign);
  processCampaign(campaign).catch(error => { campaign.status = 'failed'; campaign.error = error.message; });
  res.status(202).json({ campaignId: id, total: cleanContacts.length, batches: Math.ceil(cleanContacts.length / size), status: campaign.status });
});

app.get('/api/campaigns/:id', (req, res) => {
  const campaign = campaigns.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  res.json({ ...campaign, contacts: undefined, results: campaign.results.slice(-100) });
});

app.get('/api/logs', (req, res) => {
  if (!fs.existsSync(logFile)) return res.json({ logs: [] });
  const logs = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).slice(-200).reverse().map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  res.json({ logs });
});

app.delete('/api/logs', (req, res) => {
  if (fs.existsSync(logFile)) fs.writeFileSync(logFile, '');
  res.json({ ok: true });
});

app.post('/api/messages/test', async (req, res) => {
  const { to, templateSid, variables = {} } = req.body;
  const number = normalizeNumber(to);
  if (!number) return res.status(400).json({ error: 'Enter a valid international mobile number, for example +919876543210.' });
  if (!isApprovedTemplate(templateSid)) return res.status(400).json({ error: 'Choose an approved template SID.' });
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return res.status(400).json({ error: 'Template variables must be a JSON object.' });
  try { const message = await sendTemplate(number, templateSid, variables); writeLog('test_message_sent', { contact: number, templateSid, sid: message.sid, status: message.status || 'sent' }); res.json({ messageSid: message.sid, status: message.status || 'sent' }); }
  catch (error) { res.status(502).json({ error: `Twilio rejected the message: ${error.message}` }); }
});

app.listen(port, () => console.log(`Sendroom listening at http://localhost:${port} (${twilioEnabled ? 'Twilio enabled' : 'dry-run until Twilio credentials are configured'})`));
