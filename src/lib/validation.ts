import { z } from 'zod';

export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-\.\(\)]/g, '');
  const waFormat = /^whatsapp:\+?[1-9]\d{6,14}$/;
  const rawFormat = /^\+?[1-9]\d{6,14}$/;
  return waFormat.test(cleaned) || rawFormat.test(cleaned);
}

export function normalizePhone(phone: string): string {
  let cleaned = phone.trim().replace(/[\s\-\.\(\)]/g, '');
  if (cleaned.startsWith('whatsapp:')) {
    cleaned = cleaned.slice(9);
  }
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

export function toWhatsAppFormat(phone: string): string {
  const normalized = normalizePhone(phone);
  return `whatsapp:${normalized}`;
}

export function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const phoneSchema = z.string().refine(isValidPhone, { message: 'Invalid phone number' });

export const contactSchema = z.object({
  phone: z.string().refine(isValidPhone, { message: 'Invalid phone number format' }),
  name: z.string().max(200).optional().or(z.literal('')),
  company: z.string().max(200).optional().or(z.literal('')),
  city: z.string().max(200).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  custom_fields: z.record(z.string(), z.string()).optional()
});

export function sanitizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export function paginate(total: number, page: number, perPage: number): { pages: number; offset: number; hasNext: boolean; hasPrev: boolean } {
  const pages = Math.ceil(total / perPage) || 1;
  const safePage = Math.min(Math.max(1, page), pages);
  const offset = (safePage - 1) * perPage;
  return {
    pages,
    offset,
    hasNext: safePage < pages,
    hasPrev: safePage > 1
  };
}
