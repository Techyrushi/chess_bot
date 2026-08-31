import { test } from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';

function makeWorkbookBuffer(rows, columns) {
  const data = [columns, ...rows.map(r => columns.map(c => r[c]))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

function isValidPhone(phone) {
  if (!phone) return false;
  const cleaned = String(phone).replace(/[\s\-\.\(\)]/g, '');
  return /^(\+?[1-9]\d{1,14}|whatsapp:\+?[1-9]\d{1,14})$/.test(cleaned);
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

function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  const json = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
  if (!json.length) return { columns: [], rows: [], totalRows: 0, suggestedMap: { phone: '' } };
  const columns = Object.keys(json[0]).filter(k => k !== '__rowNum__');
  const previewRows = json.slice(0, 10).map((r, i) => ({ rowIndex: i + 2, raw: r }));
  const candidates = {
    phone: ['phone', 'phone number', 'mobile', 'cell', 'whatsapp', 'contact'],
    name: ['name', 'full name', 'contact name'],
    company: ['company', 'organization', 'business'],
    city: ['city', 'town', 'location'],
    email: ['email', 'e-mail', 'mail']
  };
  function findMatch(cols, cands) {
    for (const c of cols) { const low = c.toLowerCase().trim(); if (cands.includes(low)) return c; }
    for (const c of cols) { const low = c.toLowerCase().trim(); for (const cand of cands) { if (low.includes(cand)) return c; } }
    return undefined;
  }
  return {
    columns,
    rows: previewRows,
    totalRows: json.length,
    suggestedMap: {
      phone: findMatch(columns, candidates.phone) || '',
      name: findMatch(columns, candidates.name),
      company: findMatch(columns, candidates.company),
      city: findMatch(columns, candidates.city),
      email: findMatch(columns, candidates.email)
    }
  };
}

function mapAndValidateRows(json, columnMap) {
  const valid = [];
  const errors = [];
  const seenPhones = new Set();
  const duplicates = new Set();
  const customKeys = Object.keys(columnMap).filter(k => !['phone', 'name', 'company', 'city', 'email'].includes(k));
  for (let i = 0; i < json.length; i++) {
    const raw = json[i];
    const rowNum = i + 2;
    const phoneRaw = raw[columnMap.phone];
    if (!phoneRaw || String(phoneRaw).trim() === '') { errors.push({ row: rowNum, phone: '', error: 'Missing phone number' }); continue; }
    const phoneStr = String(phoneRaw).trim();
    if (!isValidPhone(phoneStr)) { errors.push({ row: rowNum, phone: phoneStr, error: 'Invalid phone format' }); continue; }
    const normalized = normalizePhone(phoneStr);
    if (seenPhones.has(normalized)) { duplicates.add(normalized); errors.push({ row: rowNum, phone: phoneStr, error: 'Duplicate phone in file' }); continue; }
    seenPhones.add(normalized);
    const email = columnMap.email ? String(raw[columnMap.email] || '').trim() : '';
    if (email && !isValidEmail(email)) { errors.push({ row: rowNum, phone: phoneStr, error: 'Invalid email' }); continue; }
    const customFields = {};
    for (const k of customKeys) {
      const src = columnMap[k];
      if (src && raw[src] !== undefined && raw[src] !== '') customFields[k] = String(raw[src]);
    }
    valid.push({
      phone: phoneStr,
      name: columnMap.name ? String(raw[columnMap.name] || '').trim() : undefined,
      company: columnMap.company ? String(raw[columnMap.company] || '').trim() : undefined,
      city: columnMap.city ? String(raw[columnMap.city] || '').trim() : undefined,
      email: email || undefined,
      customFields: Object.keys(customFields).length ? customFields : undefined
    });
  }
  return { valid, duplicates, errors, totalPhones: seenPhones.size };
}
function parseFullWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
}

test('parseExcelBuffer - reads columns and rows', () => {
  const cols = ['Phone', 'Name', 'Company', 'City', 'Email'];
  const rows = [
    { Phone: '+1234567890', Name: 'John', Company: 'Acme', City: 'NYC', Email: 'j@a.com' },
    { Phone: '+1098765432', Name: 'Jane', Company: 'Globex', City: 'SF', Email: 'jane@g.com' },
  ];
  const buf = makeWorkbookBuffer(rows, cols);
  const result = parseExcelBuffer(buf);
  assert.deepEqual(result.columns, cols);
  assert.equal(result.totalRows, 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.suggestedMap.phone, 'Phone');
  assert.equal(result.suggestedMap.name, 'Name');
});

test('mapAndValidateRows - validates phones, dupes, errors', () => {
  const rawRows = [
    { col_phone: '+14155238886', col_name: 'A', col_email: 'a@b.com' },
    { col_phone: '+14155238886', col_name: 'Dup', col_email: 'dup@b.com' },
    { col_phone: 'notaphone', col_name: 'Bad' },
    { col_phone: '+15555550100', col_name: 'D', col_email: 'invalid-email' },
    { col_phone: '+15555550101', col_name: 'E', col_email: 'e@b.com' },
    { col_phone: '', col_name: 'Empty' },
  ];
  const map = { phone: 'col_phone', name: 'col_name', email: 'col_email' };
  const r = mapAndValidateRows(rawRows, map);
  assert.ok(r.valid.length >= 2);
  assert.equal(r.duplicates.size, 1);
  assert.ok(r.errors.length >= 3);
  assert.ok(r.errors.some(e => e.error === 'Duplicate phone in file'));
  assert.ok(r.errors.some(e => e.error === 'Invalid phone format'));
});

test('mapAndValidateRows - valid contact has custom fields', () => {
  const rows = [{ p: '+1234567890', loyalty: 'Gold', ref: 'abc' }];
  const map = { phone: 'p', tier: 'loyalty', coupon: 'ref' };
  const r = mapAndValidateRows(rows, map);
  assert.equal(r.valid.length, 1);
  assert.equal(r.valid[0].customFields.tier, 'Gold');
  assert.equal(r.valid[0].customFields.coupon, 'abc');
});

test('parseFullWorkbook - full parse', () => {
  const cols = ['Phone', 'Name'];
  const rows = [{ Phone: '+10000000000', Name: 'X' }, { Phone: '+20000000000', Name: 'Y' }];
  const buf = makeWorkbookBuffer(rows, cols);
  const full = parseFullWorkbook(buf);
  assert.equal(full.length, 2);
  assert.equal(full[0].Name, 'X');
});
