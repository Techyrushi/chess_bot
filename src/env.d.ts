/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SESSION_SECRET: string;
  readonly DB_PATH?: string;
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly TWILIO_ACCOUNT_SID?: string;
  readonly TWILIO_AUTH_TOKEN?: string;
  readonly TWILIO_WHATSAPP_NUMBER?: string;
  readonly TWILIO_WEBHOOK_SECRET?: string;
  readonly UPLOAD_DIR?: string;
  readonly MAX_UPLOAD_SIZE?: string;
  readonly SEND_DELAY_MIN_MS?: string;
  readonly SEND_DELAY_MAX_MS?: string;
  readonly MAX_RETRIES?: string;
  readonly APP_URL?: string;
  readonly NODE_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
