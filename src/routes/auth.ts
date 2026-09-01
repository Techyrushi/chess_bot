import { Router, Request, Response, NextFunction } from 'express';
import { loginAdmin, getAdminById } from '../lib/auth';
import { createSession, destroySession } from '../lib/sessions';

const router = Router();

export default async function handleAuth(req: any, res: Response, next: NextFunction) {
  try {
    const path = req.path;
    const method = req.method;

    // POST /api/auth/login
    if (method === 'POST' && path === '/api/auth/login') {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const result = await loginAdmin(email, password);
      if (!result.admin) {
        return res.status(401).json({ error: result.error || 'Invalid credentials' });
      }

      const sessionId = await createSession(result.admin.id);
      if (!sessionId) {
        return res.status(500).json({ error: 'Failed to create session' });
      }

      res.cookie('session_id', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      return res.json({
        success: true,
        admin: { id: result.admin.id, email: result.admin.email }
      });
    }

    // GET /api/auth/me
    if (method === 'GET' && path === '/api/auth/me') {
      if (!req.admin) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      return res.json({ admin: req.admin });
    }

    // POST /api/auth/logout
    if (method === 'POST' && path === '/api/auth/logout') {
      const cookieHeader = req.headers.cookie || '';
      const sessionId = cookieHeader
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('session_id='))
        ?.slice(11);

      if (sessionId) {
        await destroySession(sessionId);
      }

      res.clearCookie('session_id');
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
