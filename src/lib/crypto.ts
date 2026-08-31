import { createHmac, timingSafeEqual } from 'crypto';

export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  try {
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += key + params[key];
    }
    const expected = createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
    const expectedBuf = Buffer.from(expected, 'base64');
    const signatureBuf = Buffer.from(signature, 'base64');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

export function generateWebhookIdempotencyKey(sid: string, status: string): string {
  return `${sid}:${status}`;
}

export function safeNumber(val: any, fallback: number = 0): number {
  const n = Number(val);
  return isFinite(n) ? n : fallback;
}
