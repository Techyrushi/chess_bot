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
