import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { getDb } from './src/db/index';
import { parseSessionFromCookies, getSession, cleanupExpiredSessions } from './src/lib/sessions';
import { getAdminById } from './src/lib/auth';

// Routes
import authRoutes from './src/routes/auth';
import campaignRoutes from './src/routes/campaigns';
import contactRoutes from './src/routes/contacts';
import contactListRoutes from './src/routes/contact-lists';
import templateRoutes from './src/routes/templates';
import importRoutes from './src/routes/import';
import settingsRoutes from './src/routes/settings';
import inboxRoutes from './src/routes/inbox';
import dashboardRoutes from './src/routes/dashboard';
import auditLogRoutes from './src/routes/audit-logs';
import mediaRoutes from './src/routes/media';
import webhookRoutes from './src/routes/webhooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app: Express = express();
const port = Number(process.env.PORT || 4321);

// Middleware: Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Middleware: Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Middleware: Multipart file upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware: Session and Auth
app.use(async (req: any, res: any, next: NextFunction) => {
  try {
    // Clean up expired sessions
    try {
      await cleanupExpiredSessions();
    } catch (_) {}

    // Parse session
    const cookieHeader = req.headers.cookie || '';
    const sessionId = parseSessionFromCookies(cookieHeader);
    const session = sessionId ? await getSession(sessionId) : null;

    // Attach session and admin to request
    req.session = session;
    req.admin = session?.adminId ? await getAdminById(session.adminId) : null;
    req.isLoggedIn = !!req.admin;

    next();
  } catch (err) {
    console.error('Session middleware error:', err);
    next();
  }
});

// Middleware: Auth protection (redirect to login if not authenticated)
const requireAuth = (req: any, res: Response, next: NextFunction) => {
  if (!req.isLoggedIn) {
    return res.redirect('/login');
  }
  next();
};

// Middleware: Attach upload to request
app.use((req: any, res: any, next: NextFunction) => {
  req.upload = upload;
  next();
});

// Routes
app.get('/login', (req: any, res: Response) => {
  if (req.isLoggedIn) {
    return res.redirect('/');
  }
  res.render('login', { title: 'Login' });
});

app.post('/api/auth/login', authRoutes);
app.get('/api/auth/me', authRoutes);
app.post('/api/auth/logout', authRoutes);

app.get('/', requireAuth, dashboardRoutes);
app.get('/campaigns', requireAuth, campaignRoutes);
app.get('/campaigns/new', requireAuth, (req: any, res: Response) => {
  res.render('campaigns/new', { title: 'Compose Campaign', admin: req.admin });
});
app.get('/campaigns/:id', requireAuth, campaignRoutes);
app.get('/api/campaigns', campaignRoutes);
app.post('/api/campaigns', campaignRoutes);
app.get('/api/campaigns/:id', campaignRoutes);
app.put('/api/campaigns/:id', campaignRoutes);
app.post('/api/campaigns/:id/control', campaignRoutes);
app.get('/api/campaigns/:id/analytics', campaignRoutes);
app.post('/api/campaigns/:id/messages', campaignRoutes);
app.get('/api/campaigns/:id/messages', campaignRoutes);
app.post('/api/campaigns/:id/preview', campaignRoutes);

app.get('/contacts', requireAuth, contactRoutes);
app.get('/api/contacts', contactRoutes);
app.post('/api/contacts', contactRoutes);
app.get('/api/contacts/:id', contactRoutes);
app.put('/api/contacts/:id', contactRoutes);
app.delete('/api/contacts/:id', contactRoutes);

app.get('/api/contact-lists', contactListRoutes);
app.post('/api/contact-lists', contactListRoutes);
app.get('/api/contact-lists/:id', contactListRoutes);
app.delete('/api/contact-lists/:id', contactListRoutes);
app.post('/api/contact-lists/:id/add-contacts', contactListRoutes);

app.get('/templates', requireAuth, templateRoutes);
app.get('/api/templates', templateRoutes);
app.post('/api/templates', templateRoutes);
app.get('/api/templates/:id', templateRoutes);
app.put('/api/templates/:id', templateRoutes);
app.delete('/api/templates/:id', templateRoutes);

app.get('/import', requireAuth, importRoutes);
app.post('/api/import/preview', importRoutes);
app.post('/api/import/process', importRoutes);
app.get('/api/import/sample', importRoutes);

app.get('/settings', requireAuth, settingsRoutes);
app.get('/api/settings', settingsRoutes);
app.post('/api/settings', settingsRoutes);
app.post('/api/settings/whatsapp-template', settingsRoutes);

app.get('/inbox', requireAuth, inboxRoutes);
app.get('/api/inbox', inboxRoutes);
app.get('/api/inbox/:id', inboxRoutes);
app.post('/api/inbox/:id/reply', inboxRoutes);

app.get('/audit-logs', requireAuth, auditLogRoutes);
app.get('/api/audit-logs', auditLogRoutes);

app.post('/api/media/upload', (req: any, res: Response, next: NextFunction) => {
  req.upload.single('file')(req, res, (err) => {
    if (err) return next(err);
    mediaRoutes(req, res, next);
  });
});
app.get('/api/media/:filename', mediaRoutes);

app.post('/api/webhooks/twilio/incoming', webhookRoutes);
app.post('/api/webhooks/twilio/status', webhookRoutes);
app.post('/api/test-message', webhookRoutes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).render('404', { title: '404 Not Found' });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  if (req.headers.accept?.includes('application/json')) {
    res.status(status).json({ error: message });
  } else {
    res.status(status).render('error', { title: 'Error', status, message });
  }
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}`);
  console.log(`📝 API Docs: http://localhost:${port}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
