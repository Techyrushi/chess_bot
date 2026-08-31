import { getDb } from '@db/index';
import { nanoid } from 'nanoid';
import * as cookie from 'cookie';

const SESSION_COOKIE_NAME = 'wa_session';
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000;

export async function createSession(adminId: string, opts?: { ip?: string; ua?: string }): Promise<{ id: string; expiresAt: number }> {
  const db = getDb();
  const sessionId = nanoid(48);
  const maxAge = parseInt(process.env.SESSION_MAX_AGE || String(DEFAULT_MAX_AGE), 10);
  const now = Date.now();
  const expiresAt = now + maxAge;

  await db.collection('sessions').insertOne({
    _id: sessionId as any, // use sessionId as primary key string
    admin_id: adminId,
    created_at: now,
    expires_at: expiresAt,
    last_active_at: now,
    ip_address: opts?.ip || null,
    user_agent: opts?.ua || null
  });

  return { id: sessionId, expiresAt };
}

export async function getSession(sessionId: string): Promise<{ id: string; adminId: string; expiresAt: number } | null> {
  if (!sessionId) return null;
  const db = getDb();
  const now = Date.now();

  const s = await db.collection('sessions').findOne({
    _id: sessionId as any,
    expires_at: { $gt: now }
  });

  if (!s) return null;

  await db.collection('sessions').updateOne(
    { _id: sessionId as any },
    { $set: { last_active_at: now } }
  );

  return { id: s._id.toString(), adminId: s.admin_id, expiresAt: s.expires_at };
}

export async function destroySession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.collection('sessions').deleteOne({ _id: sessionId as any });
}

export function getSessionCookieHeader(sessionId: string, expiresAt: number, secure: boolean = false): string {
  return cookie.serialize(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: secure || process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt)
  });
}

export function getClearCookieHeader(): string {
  return cookie.serialize(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0)
  });
}

export function parseSessionFromCookies(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookie.parse(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export async function cleanupExpiredSessions(): Promise<number> {
  const db = getDb();
  const result = await db.collection('sessions').deleteMany({ expires_at: { $lt: Date.now() } });
  return result.deletedCount || 0;
}

export async function requireAuth(request: Request): Promise<{ adminId: string; sessionId: string } | null> {
  const cookieHeader = request.headers.get('cookie');
  const sessionId = parseSessionFromCookies(cookieHeader);
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  if (!session) return null;
  return { adminId: session.adminId, sessionId };
}
