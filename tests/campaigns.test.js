import { test } from 'node:test';
import assert from 'node:assert/strict';

const sample = {
  id: 1, phone: '+1234567890',
  name: 'John Doe', company: 'Acme', city: 'NYC',
  email: 'john@example.com',
  custom_fields: JSON.stringify({ plan: 'Pro', code: 'ABC123' }),
  opted_out: 0, created_at: 0, updated_at: 0
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function renderTemplate(body, contact) {
  if (!body) return '';
  let result = body;
  const customFields = contact.custom_fields ? JSON.parse(contact.custom_fields) : {};
  result = result.replace(/\{\{\s*name\s*\}\}/gi, contact.name || '');
  result = result.replace(/\{\{\s*first_name\s*\}\}/gi, (contact.name || '').split(' ')[0] || '');
  result = result.replace(/\{\{\s*company\s*\}\}/gi, contact.company || '');
  result = result.replace(/\{\{\s*city\s*\}\}/gi, contact.city || '');
  result = result.replace(/\{\{\s*email\s*\}\}/gi, contact.email || '');
  result = result.replace(/\{\{\s*phone\s*\}\}/gi, contact.phone || '');
  for (const [key, val] of Object.entries(customFields)) {
    const regex = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'gi');
    result = result.replace(regex, String(val || ''));
  }
  result = result.replace(/\{\{\s*\w+\s*\}\}/g, '');
  return result;
}
function extractVariables(body) {
  if (!body) return [];
  const regex = /\{\{\s*([\w]+)\s*\}\}/g;
  const vars = new Set();
  let m;
  while ((m = regex.exec(body)) !== null) vars.add(m[1].toLowerCase());
  return Array.from(vars);
}

test('renderTemplate - basic variable substitution', () => {
  const body = 'Hi {{name}} from {{company}}!';
  const out = renderTemplate(body, sample);
  assert.equal(out, 'Hi John Doe from Acme!');
});

test('renderTemplate - case insensitivity', () => {
  assert.equal(renderTemplate('Hello {{NAME}}', sample), 'Hello John Doe');
  assert.equal(renderTemplate('Visit {{City}}', sample), 'Visit NYC');
});

test('renderTemplate - first name extraction', () => {
  assert.equal(renderTemplate('Hi {{first_name}}', sample), 'Hi John');
});

test('renderTemplate - custom fields from JSON', () => {
  const body = 'Your {{plan}} plan code is {{code}}';
  const out = renderTemplate(body, sample);
  assert.equal(out, 'Your Pro plan code is ABC123');
});

test('renderTemplate - missing variables become empty', () => {
  assert.equal(renderTemplate('Hello {{nonexistent}}', sample), 'Hello ');
});

test('extractVariables', () => {
  const vars = extractVariables('Hi {{name}}, are you in {{city}} with {{company}}?');
  assert.deepEqual(vars.sort(), ['city', 'company', 'name']);
});

test('extractVariables - no vars', () => {
  assert.deepEqual(extractVariables('Hello world'), []);
});

test('extractVariables - dedup', () => {
  const vars = extractVariables('{{name}} and {{name}}');
  assert.equal(vars.length, 1);
});

function normalizeTwilioMessageStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['sent', 'delivered', 'read'].includes(normalized)) return 'sent';
  if (['accepted', 'queued', 'sending', 'pending'].includes(normalized)) return 'pending';
  return 'failed';
}

test('normalizeTwilioMessageStatus - maps approved template delivery states', () => {
  assert.equal(normalizeTwilioMessageStatus('queued'), 'pending');
  assert.equal(normalizeTwilioMessageStatus('sending'), 'pending');
  assert.equal(normalizeTwilioMessageStatus('sent'), 'sent');
  assert.equal(normalizeTwilioMessageStatus('delivered'), 'sent');
  assert.equal(normalizeTwilioMessageStatus('failed'), 'failed');
});

const { validateCampaignSendInput } = await import('../src/lib/validation.ts');
const { parseObjectId } = await import('../src/db/index.ts');

test('validateCampaignSendInput - allows direct template sends without custom message text', () => {
  const input = {
    name: 'Launch Campaign',
    contactListId: 'list_123',
    templateSid: 'HX1234567890abcdef',
    messageBody: ''
  };

  const validated = validateCampaignSendInput(input);
  assert.equal(validated.contactListId, 'list_123');
  assert.equal(validated.templateSid, 'HX1234567890abcdef');
  assert.equal(validated.messageBody, '');
  assert.doesNotThrow(() => validateCampaignSendInput(input));
});

test('validateCampaignSendInput - accepts multiple contact lists and approved template SID', () => {
  const validated = validateCampaignSendInput({
    name: 'Launch Campaign',
    contactListIds: ['list_1', 'list_2'],
    templateSid: 'HX1234567890abcdef',
    messageBody: ''
  });

  assert.deepEqual(validated.contactListIds, ['list_1', 'list_2']);
  assert.equal(validated.contactListId, 'list_1');
});

test('validateCampaignSendInput - rejects missing approved template SID', () => {
  assert.throws(() => validateCampaignSendInput({
    name: 'Launch Campaign',
    contactListId: 'list_123',
    messageBody: ''
  }), /approved WhatsApp template SID/i);
});

test('parseObjectId - safely ignores malformed ids', () => {
  assert.equal(parseObjectId('not-a-valid-id'), null);
  assert.equal(parseObjectId('507f1f77bcf86cd799439011')?.toString(), '507f1f77bcf86cd799439011');
});
