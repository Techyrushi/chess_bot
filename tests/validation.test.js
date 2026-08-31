import { test } from 'node:test';
import assert from 'node:assert/strict';

function isValidPhone(phone) {
  if (!phone) return false;
  const cleaned = String(phone).replace(/[\s\-\.\(\)]/g, '');
  const waFormat = /^whatsapp:\+?[1-9]\d{6,14}$/;
  const rawFormat = /^\+?[1-9]\d{6,14}$/;
  return waFormat.test(cleaned) || rawFormat.test(cleaned);
}
function normalizePhone(phone) {
  let cleaned = String(phone).trim().replace(/[\s\-\.\(\)]/g, '');
  if (cleaned.startsWith('whatsapp:')) cleaned = cleaned.slice(9);
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}
function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
function paginate(total, page, perPage) {
  const pages = Math.ceil(total / perPage) || 1;
  const safePage = Math.min(Math.max(1, page), pages);
  const offset = (safePage - 1) * perPage;
  return { pages, offset, hasNext: safePage < pages, hasPrev: safePage > 1 };
}

test('normalizePhone - standard formats', () => {
  assert.equal(normalizePhone('+1234567890'), '+1234567890');
  assert.equal(normalizePhone('1234567890'), '+1234567890');
  assert.equal(normalizePhone('whatsapp:+1234567890'), '+1234567890');
  assert.equal(normalizePhone(' +1 (234) 567-890 '), '+1234567890');
  assert.equal(normalizePhone('1-234.567.890'), '+1234567890');
});

test('isValidPhone - valid numbers', () => {
  assert.ok(isValidPhone('+1234567890'));
  assert.ok(isValidPhone('+14155238886'));
  assert.ok(isValidPhone('whatsapp:+14155238886'));
});

test('isValidPhone - invalid numbers', () => {
  assert.ok(!isValidPhone(''));
  assert.ok(!isValidPhone('abc'));
  assert.ok(!isValidPhone('123'));
  assert.ok(!isValidPhone('+0'));
});

test('isValidEmail', () => {
  assert.ok(isValidEmail(''));
  assert.ok(isValidEmail('a@b.com'));
  assert.ok(isValidEmail('john.doe+tag@example.co.uk'));
  assert.ok(!isValidEmail('notanemail'));
  assert.ok(!isValidEmail('a@'));
});

test('formatFileSize', () => {
  assert.equal(formatFileSize(0), '0 B');
  assert.equal(formatFileSize(500), '500 B');
  assert.ok(formatFileSize(2000).includes('KB'));
  assert.ok(formatFileSize(5 * 1024 * 1024).includes('MB'));
});

test('paginate', () => {
  const r1 = paginate(100, 1, 10);
  assert.equal(r1.pages, 10);
  assert.equal(r1.offset, 0);
  assert.equal(r1.hasNext, true);
  assert.equal(r1.hasPrev, false);

  const r2 = paginate(100, 5, 10);
  assert.equal(r2.offset, 40);
  assert.equal(r2.hasNext, true);
  assert.equal(r2.hasPrev, true);

  const r3 = paginate(100, 10, 10);
  assert.equal(r3.hasNext, false);
  assert.equal(r3.hasPrev, true);

  const r4 = paginate(5, 1, 10);
  assert.equal(r4.pages, 1);
  assert.equal(r4.hasNext, false);
});
