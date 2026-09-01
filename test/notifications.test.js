const test = require('node:test');
const assert = require('node:assert/strict');
const { getAdminNotificationTargets, normalizeWhatsAppTarget } = require('../notification-utils');

test('normalizes admin WhatsApp targets', () => {
  assert.equal(normalizeWhatsAppTarget('919370962001'), 'whatsapp:919370962001');
  assert.equal(normalizeWhatsAppTarget('+918446225859'), 'whatsapp:918446225859');
  assert.equal(normalizeWhatsAppTarget('whatsapp:+919370962001'), 'whatsapp:+919370962001');
});

test('returns both configured admin contacts once', () => {
  assert.deepEqual(
    getAdminNotificationTargets('919370962001, +918446225859, 919370962001'),
    ['whatsapp:919370962001', 'whatsapp:918446225859']
  );
});

test('rejects blank notification targets', () => {
  assert.deepEqual(getAdminNotificationTargets(' , '), []);
});
