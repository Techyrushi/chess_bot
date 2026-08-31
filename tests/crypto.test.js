import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyTwilioSignature(authToken, url, params, signature) {
  try {
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) data += key + params[key];
    const expected = createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
    const expectedBuf = Buffer.from(expected, 'base64');
    const signatureBuf = Buffer.from(signature, 'base64');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

const AUTH_TOKEN = 'test-auth-token-123';
const URL = 'https://example.com/webhook';
const PARAMS = {
  MessageSid: 'SM123',
  MessageStatus: 'delivered',
  AccountSid: 'AC123'
};

function buildSignature(token, url, params) {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  return createHmac('sha1', token).update(data, 'utf8').digest('base64');
}

test('verifyTwilioSignature - valid signature', () => {
  const sig = buildSignature(AUTH_TOKEN, URL, PARAMS);
  assert.ok(verifyTwilioSignature(AUTH_TOKEN, URL, PARAMS, sig));
});

test('verifyTwilioSignature - invalid signature', () => {
  assert.ok(!verifyTwilioSignature(AUTH_TOKEN, URL, PARAMS, 'bad-sig-base64=='));
});

test('verifyTwilioSignature - wrong token', () => {
  const sig = buildSignature('wrong-token', URL, PARAMS);
  assert.ok(!verifyTwilioSignature(AUTH_TOKEN, URL, PARAMS, sig));
});

test('verifyTwilioSignature - wrong URL', () => {
  const sig = buildSignature(AUTH_TOKEN, URL, PARAMS);
  assert.ok(!verifyTwilioSignature(AUTH_TOKEN, 'https://evil.com/webhook', PARAMS, sig));
});
