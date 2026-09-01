function normalizeWhatsAppTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.startsWith('whatsapp:') ? raw : `whatsapp:${raw.replace(/^\+/, '')}`;
}

function getAdminNotificationTargets(value = process.env.ADMIN_WHATSAPP_NUMBERS || '') {
  return [...new Set(String(value).split(',').map(normalizeWhatsAppTarget).filter(Boolean))];
}

module.exports = { getAdminNotificationTargets, normalizeWhatsAppTarget };
