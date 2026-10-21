// MarketHisob marketing site. All content is managed from the super admin panel
// (/platform/site and /platform/plans) — no rebuild or redeploy is needed:
//   content.json          defaults shipped with the site
//   siteContent/main      what the super admin published (Firestore, public read)
//   plans                 tariffs with showOnSite = true (Firestore, public read)
//   leadUrl               Cloudflare Worker (worker/) that stores a demo request and pings Telegram
const CONFIG = {
  projectId: 'smartstock-d737f',
  // Public web API key (same as the app's); Firestore rules decide what is readable.
  apiKey: 'AIzaSyA_FMzMPhgmLfrQdxklhyJbMjUXQkPCIIc',
  // Set to the deployed worker URL (npx wrangler deploy prints it).
  leadUrl: ''
};

const LANGS = ['uz', 'ru', 'en'];
const CACHE_KEY = 'hisobla_site_v1';

// Icon names must match FEATURE_ICONS in src/app/platform/pages/site/site-content.ts.
const ICONS = {
  pos: '<path d="M3 5h18v10H3zM7 19h10M12 15v4"/><path d="M7 9h4M7 12h7"/>',
  stock: '<path d="M3 8l9-5 9 5v10l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v10"/>',
  debt: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 10h8M8 14h8M8 18h5"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  shift: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  ret: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  crm: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6.5 6.5 0 013.5 6"/>',
  users: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  import: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/>',
  scan: '<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 8v8M11 8v8M14 8v8M17 8v8"/>',
  online: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/><path d="M9 9l2 2 4-4"/>',
  cloud: '<path d="M7 18a5 5 0 01-.6-9.96A6 6 0 0118 9a4.5 4.5 0 01-.5 9z"/>',
  telegram: '<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l12-9"/>',
  print: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>'
};

let content = null;
let plans = [];
let lang = 'uz';

// ---------- helpers ----------

/** Texts come from the super admin; allow only simple emphasis tags. */
function safe(html) {
  return String(html ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/&lt;(\/?)(em|b|strong|i)&gt;/g, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>')
    .replace(/\n/g, '<br>');
}

function pick(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  return loc[lang] || loc.uz || '';
}

function tx(key, vars) {
  let s = pick(content?.texts?.[key]);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

function money(n) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g, ' ');
}

/** Firestore REST typed value -> plain JS. */
function decode(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}

const restBase = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents`;

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Published values win over defaults; an empty published text falls back to the default. */
function merge(defaults, remote) {
  const r = remote || {};
  const texts = {};
  for (const key of new Set([...Object.keys(defaults.texts), ...Object.keys(r.texts || {})])) {
    const d = defaults.texts[key] || {};
    const o = (r.texts || {})[key] || {};
    texts[key] = {};
    for (const l of LANGS) texts[key][l] = (o[l] && String(o[l]).trim()) ? o[l] : (d[l] || '');
  }
  const lists = {};
  for (const name of new Set([...Object.keys(defaults.lists), ...Object.keys(r.lists || {})])) {
    lists[name] = Array.isArray((r.lists || {})[name]) ? r.lists[name] : defaults.lists[name] || [];
  }
  const contact = { ...defaults.contact };
  for (const [k, v] of Object.entries(r.contact || {})) if (v) contact[k] = v;
  return { contact, sections: { ...defaults.sections, ...(r.sections || {}) }, texts, lists };
}

// ---------- rendering ----------

const LIST_RENDERERS = {
  strip: (it) => `<div><b>${safe(pick(it.title))}</b><span>${safe(pick(it.text))}</span></div>`,
  bad: (it) => `<li>${safe(pick(it.title))}</li>`,
  good: (it) => `<li>${safe(pick(it.title))}</li>`,
  features: (it) => `<article class="feature">
      <div class="feature__icon"><svg viewBox="0 0 24 24">${ICONS[it.icon] || ICONS.star}</svg></div>
      <h3>${safe(pick(it.title))}</h3><p>${safe(pick(it.text))}</p></article>`,
  steps: (it, i) => `<li><span class="steps__n">${i + 1}</span><h3>${safe(pick(it.title))}</h3><p>${safe(pick(it.text))}</p></li>`,
  why: (it) => `<li><b>${safe(pick(it.title))}</b><span>${safe(pick(it.text))}</span></li>`,
  who: (it) => `<span>${safe(pick(it.title))}</span>`,
  faq: (it) => `<details><summary>${safe(pick(it.title))}</summary><p>${safe(pick(it.text))}</p></details>`
};

function renderPricing() {
  const grid = document.getElementById('pricingGrid');
  const show = content.sections.pricing !== false && plans.length > 0;
  document.querySelectorAll('[data-section="pricing"], [data-section-link="pricing"]').forEach((el) => { el.hidden = !show; });
  if (!show) return;
  grid.innerHTML = plans.map((p) => {
    const price = p.priceMonthly > 0
      ? `<b>${money(p.priceMonthly)}</b><span>${safe(tx('pricing.perMonth'))}</span>`
      : `<b class="plan__on-request">${safe(tx('pricing.onRequest'))}</b>`;
    const limits = [
      p.maxUsers > 0 ? tx('pricing.users', { n: p.maxUsers }) : tx('pricing.usersUnlimited'),
      p.maxProducts > 0 ? tx('pricing.products', { n: money(p.maxProducts) }) : tx('pricing.productsUnlimited')
    ];
    const extra = String(pick(p.siteFeatures) || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const items = [...limits, ...extra].map((s) => `<li>${safe(s)}</li>`).join('');
    return `<article class="plan${p.highlighted ? ' plan--hot' : ''}">
        ${p.highlighted ? `<span class="plan__badge">${safe(tx('pricing.popular'))}</span>` : ''}
        <h3>${safe(p.name)}</h3>
        <p class="plan__price">${price}</p>
        <ul>${items}</ul>
        <button type="button" class="btn ${p.highlighted ? 'btn--primary' : 'btn--ghost'}" data-demo data-plan="${safe(p.name)}">${safe(tx('pricing.cta'))}</button>
      </article>`;
  }).join('');
}

function render() {
  if (!content) return;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = tx(el.dataset.i18n);
    if (value) el.innerHTML = safe(value);
  });
  document.querySelectorAll('[data-list]').forEach((el) => {
    const name = el.dataset.list;
    const items = content.lists[name] || [];
    el.innerHTML = items.map((it, i) => LIST_RENDERERS[name](it, i)).join('');
  });

  // Section visibility (pricing is handled with the plans).
  for (const [name, on] of Object.entries(content.sections)) {
    if (name === 'pricing') continue;
    document.querySelectorAll(`[data-section="${name}"], [data-section-link="${name}"]`).forEach((el) => { el.hidden = on === false; });
  }
  renderPricing();

  document.title = tx('meta.title') || document.title;
  const desc = tx('meta.desc');
  if (desc) document.querySelector('meta[name="description"]').content = desc;
  document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('is-on', b.dataset.lang === lang));

  // Contacts
  const c = content.contact;
  document.querySelectorAll('[data-contact="phone"]').forEach((a) => { a.href = 'tel:' + String(c.phone || '').replace(/[^\d+]/g, ''); });
  document.querySelectorAll('[data-contact-label="phone"]').forEach((s) => { s.textContent = c.phone || ''; });
  const tg = String(c.telegram || '').replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  document.querySelectorAll('[data-contact="telegram"]').forEach((a) => { a.href = 'https://t.me/' + tg; a.hidden = !tg; });
  document.querySelectorAll('[data-contact="email"]').forEach((a) => { a.href = 'mailto:' + (c.email || ''); a.hidden = !c.email; });
  document.querySelectorAll('[data-contact-label="email"]').forEach((s) => { s.textContent = c.email || ''; });

  // Store types in the demo form follow the "Kimlar uchun" list.
  const type = document.getElementById('demoType');
  const current = type.value;
  type.innerHTML = '<option value=""></option>'
    + (content.lists.who || []).map((it) => `<option>${safe(pick(it.title))}</option>`).join('')
    + `<option>${safe(tx('demo.typeOther'))}</option>`;
  type.value = current;

  observeReveal();
}

function setLang(next) {
  lang = LANGS.includes(next) ? next : 'uz';
  try { localStorage.setItem('hisobla_lang', lang); } catch (e) { /* storage unavailable */ }
  render();
}

async function load() {
  // 1) Last known content paints instantly on repeat visits.
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached?.content) { content = cached.content; plans = cached.plans || []; render(); }
  } catch (e) { /* ignore */ }

  // 2) Defaults + published overrides + plans.
  let defaults;
  try {
    defaults = await fetchJson('content.json');
  } catch (e) {
    return; // keep the static HTML (or cached content)
  }
  const [remote, planDocs] = await Promise.all([
    fetchJson(`${restBase}/siteContent/main?key=${CONFIG.apiKey}`).then((d) => decodeFields(d.fields || {})).catch(() => null),
    fetchJson(`${restBase}/plans?pageSize=50&key=${CONFIG.apiKey}`).then((d) => (d.documents || []).map((x) => decodeFields(x.fields || {}))).catch(() => [])
  ]);
  content = merge(defaults, remote);
  plans = planDocs
    .filter((p) => p.active !== false && p.showOnSite === true)
    .sort((a, b) => (a.priceMonthly || 0) - (b.priceMonthly || 0));
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ content, plans })); } catch (e) { /* ignore */ }
  render();
}

// ---------- demo request ----------

const dialog = document.getElementById('demoDialog');
const form = document.getElementById('demoForm');
const errorEl = document.getElementById('demoError');
const submitBtn = document.getElementById('demoSubmit');
let openedAt = 0;
let selectedPlan = '';

function openDemo(plan) {
  selectedPlan = plan || '';
  const planEl = document.getElementById('demoPlan');
  planEl.hidden = !selectedPlan;
  planEl.querySelector('b').textContent = selectedPlan;
  form.querySelector('[data-step="form"]').hidden = false;
  form.querySelector('[data-step="done"]').hidden = true;
  errorEl.hidden = true;
  openedAt = Date.now();
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  setTimeout(() => form.elements.name.focus(), 50);
}

function closeDemo() {
  if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-demo]');
  if (trigger) {
    e.preventDefault();
    openDemo(trigger.dataset.plan);
    return;
  }
  if (e.target.closest('[data-close]')) closeDemo();
});
// Click on the backdrop closes the dialog.
dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDemo(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const digits = String(data.phone || '').replace(/\D/g, '');
  if (String(data.name || '').trim().length < 2 || digits.length < 9 || digits.length > 15) {
    errorEl.textContent = tx('demo.invalid');
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;
  submitBtn.disabled = true;
  const label = submitBtn.querySelector('span');
  label.textContent = tx('demo.sending');
  try {
    if (!CONFIG.leadUrl) throw new Error('leadUrl is not configured');
    const res = await fetch(CONFIG.leadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, plan: selectedPlan, lang, page: location.href, elapsedMs: Date.now() - openedAt })
    });
    if (!res.ok) throw new Error(String(res.status));
    form.reset();
    form.querySelector('[data-step="form"]').hidden = true;
    form.querySelector('[data-step="done"]').hidden = false;
  } catch (err) {
    errorEl.textContent = tx('demo.error');
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    label.textContent = tx('demo.submit');
  }
});

// ---------- page chrome ----------

document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

const burger = document.getElementById('burger');
const links = document.getElementById('navLinks');
burger.addEventListener('click', () => {
  const open = links.classList.toggle('is-open');
  burger.setAttribute('aria-expanded', String(open));
});
links.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    links.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
  }
});

const nav = document.querySelector('.nav');
const onScroll = () => {
  nav.classList.toggle('is-scrolled', window.scrollY > 8);
  document.body.classList.toggle('show-mobile-cta', window.scrollY > 480);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 })
  : null;

function observeReveal() {
  if (!io) return;
  document.querySelectorAll('.feature, .steps li, .why__list li, .compare__col, .faq details, .plan').forEach((el) => {
    if (el.classList.contains('reveal')) return;
    el.classList.add('reveal');
    io.observe(el);
  });
}

document.getElementById('year').textContent = new Date().getFullYear();

try { lang = localStorage.getItem('hisobla_lang') || ''; } catch (e) { lang = ''; }
if (!lang) lang = (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'uz';
observeReveal();
load();
