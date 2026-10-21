/** Demo requests from the marketing site: validation and the Telegram message. */

const LIMITS = { name: 80, phone: 20, storeName: 100, city: 80, storeType: 80, registers: 4, message: 1000, plan: 60 };
const LANGS = ['uz', 'ru', 'en'];
/** A person needs a few seconds to fill the form; faster submits are bots. */
export const MIN_FILL_MS = 1500;

function clean(value, max) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

/** Uzbek numbers are stored as +998XXXXXXXXX; anything else keeps its digits with a +. */
export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  return digits ? `+${digits}` : '';
}

/** Returns { lead } or { error } — error is a short code for the HTTP response. */
export function parseLead(body) {
  if (!body || typeof body !== 'object') return { error: 'BAD_REQUEST' };
  // Honeypot field is invisible to people.
  if (clean(body.website, 200)) return { error: 'SPAM' };
  if (typeof body.elapsedMs === 'number' && body.elapsedMs < MIN_FILL_MS) return { error: 'SPAM' };

  const name = clean(body.name, LIMITS.name);
  const phone = normalizePhone(clean(body.phone, LIMITS.phone));
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2) return { error: 'INVALID_NAME' };
  if (digits.length < 9 || digits.length > 15) return { error: 'INVALID_PHONE' };

  const lead = {
    name,
    phone,
    storeName: clean(body.storeName, LIMITS.storeName),
    city: clean(body.city, LIMITS.city),
    storeType: clean(body.storeType, LIMITS.storeType),
    registers: clean(body.registers, LIMITS.registers),
    message: clean(body.message, LIMITS.message),
    plan: clean(body.plan, LIMITS.plan),
    lang: LANGS.includes(body.lang) ? body.lang : 'uz',
    page: clean(body.page, 300)
  };
  return { lead };
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Telegram message (parse_mode HTML) for the super admins. */
export function formatLeadMessage(lead, panelUrl) {
  const lines = [
    '🆕 <b>Yangi mijoz qiziqish bildirdi</b>',
    '',
    `👤 ${escapeHtml(lead.name)}`,
    `📞 ${escapeHtml(lead.phone)}`
  ];
  const store = [lead.storeName, lead.city].filter(Boolean).map(escapeHtml).join(', ');
  if (store) lines.push(`🏪 ${store}`);
  if (lead.storeType) lines.push(`🏷 ${escapeHtml(lead.storeType)}`);
  if (lead.registers) lines.push(`🧾 Kassalar: ${escapeHtml(lead.registers)}`);
  if (lead.plan) lines.push(`💳 Tarif: ${escapeHtml(lead.plan)}`);
  if (lead.message) lines.push('', `💬 ${escapeHtml(lead.message)}`);
  lines.push('', `🌐 Til: ${lead.lang.toUpperCase()}`);
  if (panelUrl) lines.push(`➡️ <a href="${escapeHtml(panelUrl)}">Arizalar paneli</a>`);
  return lines.join('\n');
}
