# WhatsApp Bulk Campaign Manager

Production-grade WhatsApp Bulk Campaign Manager built with a simple, lightweight stack. No heavy frameworks. Pure Astro + TypeScript + SQLite + Twilio.

## ✨ Features

- **Premium SaaS Dashboard** — modern, responsive UI with dark/light mode toggle
- **Secure Authentication** — admin login, HTTP-only session cookies, bcrypt password hashing, session expiry
- **Dashboard Stats** — campaigns, contacts, sent/delivered/read/failed counts, opt-outs, unread inbox
- **Contact Management** — search, filter, paginate, opt-out support, contact lists
- **Excel/CSV Import** — drag & drop, preview, intelligent column auto-mapping, duplicate detection, validation
- **Campaign Wizard** — Contacts → Message → Media → Review. Save draft or launch immediately
- **Personalization** — `{{name}}`, `{{company}}`, `{{city}}`, `{{email}}`, `{{first_name}}`, `{{phone}}` and any custom columns from your sheets
- **Live WhatsApp Preview** — render bubbles as you type, customize sample values
- **Message Templates** — reusable approved WhatsApp templates with variables
- **Media Attachments** — Image / Video / PDF via public HTTPS URLs
- **Campaign Control** — start / pause / resume / cancel with state machine
- **Throttled Sending** — configurable random delay per message, auto retries on transient failures
- **Message Status Tracking** — queued → sent → delivered → read / failed / undelivered with timestamps
- **Twilio Webhooks** — signature-verified status callbacks & incoming messages with idempotency
- **Campaign Reports** — per-message log with delivery/read/failure rates, progress bars, error codes
- **Analytics** — delivery / read / failure rates per campaign
- **WhatsApp Inbox** — reply to incoming messages, mark as read, search, filter
- **Global Opt-Outs** — STOP/CANCEL/UNSUBSCRIBE/QUIT/END auto-processing
- **Audit Logs** — full admin activity trail with resource types, IP, and details
- **Server-Side Secrets** — Twilio credentials never leave the server. Settings page updates in DB.
- **Efficient SQLite** — WAL journal mode, indexes on all lookups, transactions for bulk operations, offset-based pagination
- **Tests** — Node native test runner with 4 suites

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Astro UI (pages + components + CSS, Vanilla JS client) │
└───────────────────┬─────────────────────────────────────┘
                    │ fetch() + FormData
┌───────────────────▼─────────────────────────────────────┐
│  Astro API Routes  (src/pages/api/*)                    │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│  Services  (src/services/*)                             │
│    campaigns · contacts · excel · inbox · sender       │
│    templates · twilio                                    │
└─────────┬───────────────────────────┬───────────────────┘
          │                           │
┌─────────▼───────────┐    ┌──────────▼──────────────────┐
│  SQLite (better-sqlite3) │    │  Twilio WhatsApp API     │
│  ├── contacts             │    │  ├── Message create      │
│  ├── contact_lists        │    │  └── StatusCallback URL │
│  ├── campaigns + messages │    └─────────────────────────┘
│  ├── templates · settings │
│  ├── sessions · admins    │
│  ├── incoming · opt_outs  │
│  └── audit_logs           │
└──────────────────────────┘
          ▲
          │ Twilio posts form-encoded
┌─────────┴──────────────────────────────────────────────┐
│  Webhooks  (src/pages/api/webhooks/twilio/*)           │
│  Signature verification + idempotency + DB updates     │
└────────────────────────────────────────────────────────┘
```

## 📁 Project Layout

```
.
├── scripts/
│   ├── init-db.js          # Create schema + default admin + settings
│   └── seed-db.js          # Sample contacts, list, templates, campaign
├── src/
│   ├── components/         # Reusable UI components (reserved)
│   ├── db/
│   │   └── index.ts        # Schema + indexes + getDb() / initDb()
│   ├── layouts/
│   │   └── Layout.astro    # Shell (sidebar/topbar/nav/dark mode)
│   ├── lib/
│   │   ├── auth.ts         # findAdmin / hashPassword / verifyPassword
│   │   ├── audit.ts        # createAuditLog / getAuditLogs
│   │   ├── crypto.ts       # Twilio sig verify + idempotency key
│   │   ├── sessions.ts     # create/get/destroy session, cookies, requireAuth
│   │   ├── settings.ts     # Twilio + send settings (from DB/env)
│   │   └── validation.ts   # phones, email, sanitize, pagination
│   ├── pages/
│   │   ├── 404.astro
│   │   ├── index.astro     # Dashboard
│   │   ├── login.astro     # Sign-in screen
│   │   ├── contacts.astro
│   │   ├── import.astro
│   │   ├── inbox.astro
│   │   ├── templates.astro
│   │   ├── settings.astro
│   │   ├── audit-logs.astro
│   │   ├── campaigns/
│   │   │   ├── index.astro
│   │   │   └── [id].astro  # Wizard for "new" + detail for campaigns
│   │   └── api/
│   │       ├── auth/{login,logout,me}.ts
│   │       ├── dashboard/stats.ts
│   │       ├── contacts/{index,[id]}.ts
│   │       ├── contact-lists/{index,[id],[id]/add-contacts}.ts
│   │       ├── import/{preview,process}.ts
│   │       ├── campaigns/{index,[id],[id]/control,[id]/messages,[id]/analytics,preview}.ts
│   │       ├── templates/{index,[id]}.ts
│   │       ├── inbox/{index,[id]}.ts
│   │       ├── optouts/index.ts
│   │       ├── settings/index.ts
│   │       ├── audit-logs/index.ts
│   │       ├── test-message/index.ts
│   │       └── webhooks/twilio/{status,incoming}.ts
│   ├── scripts/app.js      # Toast, API helper, modals, theme, pagination
│   ├── services/
│   │   ├── campaigns.ts    # CRUD, analytics, template rendering, message listing
│   │   ├── contacts.ts     # CRUD, list management, opt-outs, bulk create
│   │   ├── excel.ts        # Parse workbook · suggest mapping · validate
│   │   ├── inbox.ts        # Incoming messages + reply tracking
│   │   ├── sender.ts       # Throttled runner: start/pause/resume/cancel
│   │   ├── templates.ts    # Reusable message templates
│   │   └── twilio.ts       # Twilio client + sendMessage helpers
│   ├── styles/global.css   # All UI styles (light/dark tokens, layout, components)
│   ├── webhooks/twilio.ts  # handleStatusUpdate / handleIncomingMessage
│   └── env.d.ts
├── tests/
│   ├── validation.test.js
│   ├── campaigns.test.js
│   ├── crypto.test.js
│   └── excel.test.js
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

## 🚀 Quick Start

Requires **Node.js ≥ 18.17.0** (≥ 22 recommended).

```bash
# 1. Install deps
npm install

# 2. Configure environment (edit values!)
cp .env.example .env

# 3. Initialize database + default admin + settings
npm run db:init

# 4. [Optional] Seed sample data (contacts, list, templates, draft campaign)
npm run db:seed

# 5. Run tests (no build needed — pure logic tests)
npm test

# 6. Start dev server (http://localhost:4321)
npm run dev
```

Default credentials (from `.env`, change them):

- Email: **`admin@example.com`**
- Password: **`ChangeMe123!`**

## 🛠️ Build & Production

```bash
# Typecheck + Production build
npm run build

# Preview the production build locally
npm run preview

# Real deployment (systemd / pm2 / Docker):
node ./dist/server/entry.mjs
```

`astro.config.mjs` uses `@astrojs/node` in **standalone** mode. The produced `dist/server/entry.mjs` listens on `$PORT` (default `4321`) and exposes all routes + static assets.

## 🔐 Twilio Setup

1. Create a Twilio account and enable **WhatsApp Sender** (sandbox OK for testing).
2. Go to **Settings → Twilio** in-app and fill in:
   - Account SID
   - Auth Token
   - WhatsApp Number (format `whatsapp:+14155238886`)
3. In Twilio Console → WhatsApp → Senders, configure:
   - **When a message comes in**: `POST https://<your-domain>/api/webhooks/twilio/incoming`
   - **Status callback URL** (per-message, set automatically): `https://<your-domain>/api/webhooks/twilio/status`
4. For signature verification to always run, set the `APP_URL` env var to your public base URL.

All credential storage is server-side → the client never sees secrets.

## 📨 Campaigns Quick Flow

1. **Import contacts** — Go to `/import`, drag an Excel/CSV, confirm column mapping, optionally create & assign a list.
2. **Create campaign** — Visit `/campaigns/new`.
   1. Pick the list.
   2. Compose message with `{{variables}}`. Live preview refreshes as you type.
   3. Add media URL + tune send delays & retries.
   4. Review → Save Draft or Send.
3. **Monitor** — The detail page (`/campaigns/:id`) shows:
   - Progress bar + realtime counts
   - Delivery / Read / Failure rate cards
   - Per-message log with statuses, SIDs, error codes, timestamps
   - Pause / Resume / Cancel buttons while running

## 🧪 Tests

```bash
npm test
# → Runs tests/*.test.js via node:test
```

Suites:

- **validation.test.js** — phone normalization, email, file size, pagination
- **campaigns.test.js** — template rendering (case-insensitive variables, custom JSON fields, var extraction)
- **crypto.test.js** — Twilio HMAC signature verification (4 scenarios)
- **excel.test.js** — Workbook parse, column auto-mapping, validation/dupes, custom field mapping

## 🔒 Security Notes

- **Sessions**: 48-byte `nanoid` tokens stored in HTTP-only `SameSite=Lax` cookies, indexed + auto-expired. Auto-cleanup runs on every page load.
- **Passwords**: `bcrypt` at cost 12. Settings page forces current password to change it.
- **Webhook signatures**: Uses Twilio's documented HMAC-SHA1 scheme with `X-Twilio-Signature`. Idempotency: `(sid + status)` key stored in-process with bounded LRU.
- **Opt-outs**: STOP/CANCEL/UNSUBSCRIBE/QUIT/END inbound messages flip BOTH the contacts.opted_out flag AND insert into a dedicated `opt_outs` table (fast pre-send reject).
- **Input validation**: Server-side Zod-style checks on every endpoint. Phone/email regex before any DB writes.
- **Secrets**: Twilio `auth_token` is stored in SQLite (or `.env`). The UI displays only `•••••••<last 4>`. Never served to client.
- **Content Security**: All user data rendered in Astro templates is HTML-escaped automatically. Extra `escapeHtml()` is applied inside all JS-generated HTML.
- **CSRF**: Form submissions on cookie-auth routes use `SameSite=Lax` which provides robust CSRF protection for standard browser top-level navigations and fetch. For additional hardening in production, add a `csrfTokens` table and include `X-CSRF-Token` headers.

## ⚡ Performance Highlights

- **WAL journal mode** for concurrent read/write SQLite throughput.
- **Batch DB writes** (500 rows per transaction) on import.
- **All lookups indexed**: `contacts.phone`, `messages.sid`, `messages.campaign_id`, `incoming.from_phone`, `sessions(id, expires_at)`, `audit_logs.created_at`, etc.
- **Offset + LIMIT pagination** with stable created_at ordering.
- **Count queries use indexed status columns** rather than full table scans on cold reports.
- **Campaign sender** batches 20 messages per run-loop iteration with async sleeps between, so the event loop stays responsive for API requests.

## 🐛 Debugging Tips

- Messages stuck in `queued`? Check:
  1. Twilio settings populated? Send a **Test Message** from `/settings`.
  2. `APP_URL` set so status callbacks are reachable on your public domain?
  3. Server logs — the sender catches errors and writes to `console.error`.
- Import failing? Download the error report table in the results page (row numbers correspond to your sheet).
- Signature verification fails? Confirm your public-facing URLs are HTTPS and `APP_URL` matches exactly (protocol + host + path).
- Dark-mode flashes on load? An inline `<script>` in `Layout.astro` reads `localStorage.theme` before paint.

## 📜 License

MIT. Use for good — comply with Twilio's WhatsApp policies and applicable anti-spam/telecom regulations in your jurisdiction.
