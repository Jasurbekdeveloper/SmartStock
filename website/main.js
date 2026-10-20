// Contact details shown in the "Aloqa" section — edit these before publishing.
const CONTACT = {
  phone: '+998 90 000 00 00',
  telegram: 'hisobla_uz'
};

// Uzbek is the source text in index.html; it is captured from the DOM on load.
const I18N = {
  ru: {
    'nav.features': 'Возможности',
    'nav.how': 'Как это работает',
    'nav.why': 'Преимущества',
    'nav.faq': 'Вопросы',
    'nav.contact': 'Контакты',
    'nav.cta': 'Запросить демо',
    'hero.eyebrow': 'Система продаж и склада для магазинов',
    'hero.title': 'Продажи, склад и долги — в <em>одной</em> системе',
    'hero.lead': 'Hisobla заменяет тетрадь и Excel: быстро продаёте на кассе, остаток списывается сам, а кто сколько должен и сколько вы заработали сегодня — всегда перед глазами.',
    'hero.cta1': 'Получить бесплатное демо',
    'hero.cta2': 'Смотреть возможности',
    'hero.tick1': 'Работает даже без интернета',
    'hero.tick2': 'На компьютере, планшете и телефоне',
    'hero.tick3': 'На узбекском, русском и английском',
    'mock.title': 'Касса — смена 1',
    'mock.search': 'Поиск по штрих-коду или названию…',
    'mock.subtotal': 'Итого',
    'mock.discount': 'Скидка',
    'mock.vat': 'в т.ч. НДС 12%',
    'mock.toPay': 'К оплате',
    'mock.cash': 'Наличные',
    'mock.card': 'Карта',
    'mock.debt': 'В долг',
    'mock.pay': 'Оплатить · F4',
    'mock.toast': 'Чек №A-1042 сохранён, остаток обновлён',
    'strip.k1': 'Офлайн',
    'strip.v1': 'продажи продолжаются без интернета',
    'strip.k2': 'В облаке',
    'strip.v2': 'данные надёжно хранятся в Google Firebase',
    'strip.k3': '3 роли',
    'strip.v3': 'админ, менеджер и кассир — у каждого свои права',
    'strip.k4': '0 установки',
    'strip.v4': 'открывается в браузере, можно установить как приложение',
    'ps.eyebrow': 'Знакомая ситуация?',
    'ps.title': 'Учёт в тетради — потерянные деньги',
    'ps.badTitle': 'Сейчас',
    'ps.bad1': 'Что осталось на складе, известно только после пересчёта',
    'ps.bad2': 'Долги в тетради, кто сколько вернул — непонятно',
    'ps.bad3': 'В конце дня касса не сходится с продажами',
    'ps.bad4': 'Неизвестно, какой товар приносит прибыль',
    'ps.goodTitle': 'С Hisobla',
    'ps.good1': 'После каждой продажи остаток обновляется автоматически',
    'ps.good2': 'Долг и история оплат каждого клиента в одном месте',
    'ps.good3': 'При закрытии смены Z-отчёт: наличные, карта, возвраты',
    'ps.good4': 'Дневная и месячная прибыль, самые продаваемые товары',
    'f.eyebrow': 'Возможности',
    'f.title': 'Всё, что нужно магазину',
    'f.lead': 'Не нужны отдельные программы, таблицы и тетради — все разделы связаны между собой.',
    'f.pos.t': 'Быстрая касса',
    'f.pos.d': 'Сканер штрих-кодов, горячие клавиши (F4 — оплата), скидки, смешанная оплата наличными и картой, печать чека.',
    'f.stock.t': 'Складской учёт',
    'f.stock.d': 'Приход, расход, инвентаризация и история движений. Себестоимость считается автоматически по средней цене (AVCO).',
    'f.debt.t': 'Книга долгов',
    'f.debt.d': 'Продажа в долг, частичные оплаты, остаток по каждому клиенту и список просроченных долгов.',
    'f.stats.t': 'Статистика и прибыль',
    'f.stats.d': 'Выручка, чистая прибыль, топ товаров и заканчивающиеся остатки — по дням, неделям, месяцам. Экспорт в Excel.',
    'f.shift.t': 'Смены и Z-отчёт',
    'f.shift.d': 'Кассир открывает и закрывает смену; система сверяет наличные в кассе с ожидаемой суммой.',
    'f.ret.t': 'Возвраты',
    'f.ret.d': 'При возврате товара деньги возвращаются, остаток восстанавливается, а отчёты корректируются автоматически.',
    'f.crm.t': 'Клиенты и поставщики',
    'f.crm.d': 'Покупки каждого клиента, товары от поставщиков и долги перед ними.',
    'f.users.t': 'Сотрудники и контроль',
    'f.users.d': 'Кассир не видит себестоимость и прибыль. Каждое изменение пишется в журнал аудита: кто, когда, что сделал.',
    'f.import.t': 'Быстрое добавление товаров',
    'f.import.d': 'Импорт из Excel, несколько единиц измерения (шт, метр, кг, мешок), категории и печать этикеток со штрих-кодом.',
    'how.eyebrow': 'Как это работает',
    'how.title': 'Запуск за один день',
    'how.s1t': 'Подключаем',
    'how.s1d': 'Создаём отдельную систему для вашего магазина и выдаём аккаунт администратора.',
    'how.s2t': 'Добавляете товары',
    'how.s2d': 'Загружаете готовый список из Excel или добавляете товары сканером.',
    'how.s3t': 'Добавляете сотрудников',
    'how.s3d': 'Выдаёте логины кассирам и менеджерам — каждый видит только свой раздел.',
    'how.s4t': 'Начинаете продавать',
    'how.s4d': 'Касса работает, отчёты собираются сами. Мы обучим и поможем.',
    'why.eyebrow': 'Почему Hisobla',
    'why.title': 'Создано для магазинов Узбекистана',
    'why.lead': 'Не нужно адаптировать зарубежные программы — Hisobla учитывает особенности местной торговли.',
    'why.p1t': 'Сум и НДС',
    'why.p1d': 'Цены с НДС или без — налог правильно выделяется в чеке.',
    'why.p2t': 'Продажа в долг',
    'why.p2d': 'Долг — обычный способ оплаты на кассе, отдельная тетрадь не нужна.',
    'why.p3t': 'Не зависит от интернета',
    'why.p3d': 'Связь пропала — продажи не останавливаются; данные синхронизируются, когда интернет вернётся.',
    'why.p4t': 'Четыре языка',
    'why.p4d': 'Узбекский (латиница и кириллица), русский и английский — каждый работает на своём языке.',
    'why.p5t': 'Любое устройство',
    'why.p5d': 'Компьютер, планшет или телефон — дорогой кассовый аппарат не обязателен.',
    'why.p6t': 'Данные в безопасности',
    'why.p6d': 'Резервная копия в облаке, права по ролям и журнал изменений.',
    'who.eyebrow': 'Для кого',
    'who.title': 'Для любого магазина, который продаёт товар',
    'who.t1': 'Стройматериалы',
    'who.t2': 'Хозтовары',
    'who.t3': 'Продукты и минимаркеты',
    'who.t4': 'Автозапчасти',
    'who.t5': 'Электрика и сантехника',
    'who.t6': 'Одежда и обувь',
    'who.t7': 'Оптовая торговля',
    'who.t8': 'Аптеки и косметика',
    'faq.eyebrow': 'Вопросы',
    'faq.title': 'Частые вопросы',
    'faq.q1': 'Нужно ли что-то устанавливать на компьютер?',
    'faq.a1': 'Нет. Hisobla открывается в браузере. При желании её можно установить как приложение в один клик и запускать с рабочего стола.',
    'faq.q2': 'Что будет, если пропадёт интернет?',
    'faq.a2': 'Касса продолжит работать. Продажи сохраняются на устройстве и автоматически отправляются в облако, когда интернет вернётся.',
    'faq.q3': 'Какое оборудование нужно?',
    'faq.a3': 'Любой компьютер или планшет. Сканер штрих-кодов и принтер чеков — по желанию, подходят обычные USB-устройства. Камера телефона тоже может работать как сканер.',
    'faq.q4': 'Можно перенести существующий список товаров?',
    'faq.a4': 'Да. Загружаете файл Excel — товары создаются автоматически с названием, ценой, остатком и штрих-кодом.',
    'faq.q5': 'Кто видит мои данные?',
    'faq.a5': 'Только вы и добавленные вами сотрудники. Данные каждого магазина хранятся отдельно, а кассир не видит себестоимость и прибыль.',
    'faq.q6': 'Сколько это стоит?',
    'faq.a6': 'Цена зависит от размера магазина и количества касс. Свяжитесь с нами — покажем бесплатное демо и предложим подходящий тариф.',
    'cta.title': 'Попробуйте в своём магазине',
    'cta.lead': 'Позвоните или напишите в Telegram — за 15 минут покажем систему и ответим на вопросы.',
    'footer.tag': 'Учёт продаж, склада и долгов для магазина.'
  },
  en: {
    'nav.features': 'Features',
    'nav.how': 'How it works',
    'nav.why': 'Why us',
    'nav.faq': 'FAQ',
    'nav.contact': 'Contact',
    'nav.cta': 'Request a demo',
    'hero.eyebrow': 'Point of sale and inventory for retail stores',
    'hero.title': 'Sales, stock and debts — in <em>one</em> system',
    'hero.lead': 'Hisobla replaces the notebook and the spreadsheet: sell fast at the till, stock updates itself, and who owes you what and today’s profit are always in front of you.',
    'hero.cta1': 'Get a free demo',
    'hero.cta2': 'See the features',
    'hero.tick1': 'Keeps working offline',
    'hero.tick2': 'On desktop, tablet and phone',
    'hero.tick3': 'In Uzbek, Russian and English',
    'mock.title': 'Checkout — shift 1',
    'mock.search': 'Search by barcode or name…',
    'mock.subtotal': 'Subtotal',
    'mock.discount': 'Discount',
    'mock.vat': 'incl. VAT 12%',
    'mock.toPay': 'To pay',
    'mock.cash': 'Cash',
    'mock.card': 'Card',
    'mock.debt': 'On credit',
    'mock.pay': 'Pay · F4',
    'mock.toast': 'Receipt #A-1042 saved, stock updated',
    'strip.k1': 'Offline',
    'strip.v1': 'sales continue without internet',
    'strip.k2': 'Cloud',
    'strip.v2': 'data is stored safely in Google Firebase',
    'strip.k3': '3 roles',
    'strip.v3': 'admin, manager and cashier — each with their own rights',
    'strip.k4': 'Zero install',
    'strip.v4': 'runs in the browser, installable as an app',
    'ps.eyebrow': 'Sound familiar?',
    'ps.title': 'Paper bookkeeping is money lost',
    'ps.badTitle': 'Today',
    'ps.bad1': 'You only know what’s in stock after a full count',
    'ps.bad2': 'Debts live in a notebook — who paid what is a mess',
    'ps.bad3': 'At closing, the cash drawer doesn’t match sales',
    'ps.bad4': 'You don’t know which products actually make money',
    'ps.goodTitle': 'With Hisobla',
    'ps.good1': 'Stock updates automatically after every sale',
    'ps.good2': 'Every customer’s debt and payment history in one place',
    'ps.good3': 'Z-report at shift close: cash, card and refunds',
    'ps.good4': 'Daily and monthly profit, best-selling products',
    'f.eyebrow': 'Features',
    'f.title': 'Everything a store needs',
    'f.lead': 'No separate apps, spreadsheets or notebooks — every module is connected.',
    'f.pos.t': 'Fast checkout',
    'f.pos.d': 'Barcode scanner, keyboard shortcuts (F4 to pay), discounts, split cash + card payments and receipt printing.',
    'f.stock.t': 'Inventory control',
    'f.stock.d': 'Stock in, stock out, adjustments and movement history. Cost is calculated automatically using weighted average (AVCO).',
    'f.debt.t': 'Debt book',
    'f.debt.d': 'Sell on credit, accept partial payments, see balances per customer and overdue debts.',
    'f.stats.t': 'Analytics and profit',
    'f.stats.d': 'Revenue, net profit, top products and low-stock alerts by day, week and month. Export to Excel.',
    'f.shift.t': 'Shifts and Z-report',
    'f.shift.d': 'Cashiers open and close shifts; the system reconciles cash in the drawer against the expected amount.',
    'f.ret.t': 'Returns',
    'f.ret.d': 'On a return the money is refunded, stock is restored and reports adjust automatically.',
    'f.crm.t': 'Customers and suppliers',
    'f.crm.d': 'Each customer’s purchases, goods received from suppliers and what you owe them.',
    'f.users.t': 'Staff and control',
    'f.users.d': 'Cashiers can’t see cost or profit. Every change is written to an audit log: who did what, and when.',
    'f.import.t': 'Quick product setup',
    'f.import.d': 'Excel import, multiple units (piece, metre, kg, bag), categories and barcode label printing.',
    'how.eyebrow': 'How it works',
    'how.title': 'Up and running in a day',
    'how.s1t': 'We connect you',
    'how.s1d': 'We set up a dedicated system for your store and hand you the admin account.',
    'how.s2t': 'Add your products',
    'how.s2d': 'Upload your existing Excel list or add products with a scanner.',
    'how.s3t': 'Add your staff',
    'how.s3d': 'Give cashiers and managers their logins — each sees only their own area.',
    'how.s4t': 'Start selling',
    'how.s4d': 'The till runs and reports build themselves. We train you and stay on hand.',
    'why.eyebrow': 'Why Hisobla',
    'why.title': 'Built for stores in Uzbekistan',
    'why.lead': 'No need to bend foreign software to fit — Hisobla follows how local retail actually works.',
    'why.p1t': 'Som and VAT',
    'why.p1d': 'Prices with or without VAT — tax is separated correctly on the receipt.',
    'why.p2t': 'Selling on credit',
    'why.p2d': 'Credit is just another payment method at the till — no separate notebook.',
    'why.p3t': 'Internet-independent',
    'why.p3d': 'If the connection drops, sales go on; data syncs once you’re back online.',
    'why.p4t': 'Four languages',
    'why.p4d': 'Uzbek (Latin and Cyrillic), Russian and English — everyone works in their own language.',
    'why.p5t': 'Any device',
    'why.p5d': 'Desktop, tablet or phone — no expensive cash register required.',
    'why.p6t': 'Your data is safe',
    'why.p6d': 'Cloud backup, role-based permissions and a change log.',
    'who.eyebrow': 'Who it’s for',
    'who.title': 'Any store that sells goods',
    'who.t1': 'Building materials',
    'who.t2': 'Household goods',
    'who.t3': 'Grocery and minimarkets',
    'who.t4': 'Auto parts',
    'who.t5': 'Electrical and plumbing',
    'who.t6': 'Clothing and footwear',
    'who.t7': 'Wholesale',
    'who.t8': 'Pharmacy and cosmetics',
    'faq.eyebrow': 'FAQ',
    'faq.title': 'Frequently asked questions',
    'faq.q1': 'Do I need to install anything?',
    'faq.a1': 'No. Hisobla runs in the browser. If you like, you can install it as an app in one click and launch it from the desktop.',
    'faq.q2': 'What happens if the internet goes down?',
    'faq.a2': 'The till keeps working. Sales are stored on the device and sent to the cloud automatically when the connection returns.',
    'faq.q3': 'What hardware do I need?',
    'faq.a3': 'Any computer or tablet. A barcode scanner and receipt printer are optional — standard USB devices work. A phone camera can act as a scanner too.',
    'faq.q4': 'Can I bring my existing product list?',
    'faq.a4': 'Yes. Upload an Excel file and products are created with name, price, stock and barcode.',
    'faq.q5': 'Who can see my data?',
    'faq.a5': 'Only you and the staff you add. Each store’s data is kept separate, and cashiers can’t see cost or profit.',
    'faq.q6': 'How much does it cost?',
    'faq.a6': 'Pricing depends on store size and number of tills. Get in touch — we’ll give you a free demo and suggest the right plan.',
    'cta.title': 'Try it in your store',
    'cta.lead': 'Call us or message on Telegram — we’ll walk you through the system in 15 minutes and answer your questions.',
    'footer.tag': 'Sales, inventory and debt tracking for stores.'
  }
};

const META = {
  uz: { title: document.title, desc: document.querySelector('meta[name="description"]').content },
  ru: { title: 'Hisobla — система продаж и склада для магазина', desc: 'Hisobla — касса, склад, книга долгов и статистика в одной системе. Работает офлайн, хранит данные в облаке.' },
  en: { title: 'Hisobla — point of sale and inventory for stores', desc: 'Hisobla — checkout, inventory, debt book and analytics in one system. Works offline, backed up in the cloud.' }
};

const nodes = document.querySelectorAll('[data-i18n]');
I18N.uz = {};
nodes.forEach((el) => { I18N.uz[el.dataset.i18n] = el.innerHTML; });

function setLang(lang) {
  if (!I18N[lang]) lang = 'uz';
  const dict = I18N[lang];
  nodes.forEach((el) => {
    const value = dict[el.dataset.i18n];
    if (value !== undefined) el.innerHTML = value;
  });
  document.documentElement.lang = lang;
  document.title = META[lang].title;
  document.querySelector('meta[name="description"]').content = META[lang].desc;
  document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('is-on', b.dataset.lang === lang));
  try { localStorage.setItem('hisobla_lang', lang); } catch (e) { /* storage unavailable */ }
}

document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

let initial = 'uz';
try { initial = localStorage.getItem('hisobla_lang') || ''; } catch (e) { /* storage unavailable */ }
if (!initial) initial = (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'uz';
if (initial !== 'uz') setLang(initial);

// Contact links
const phoneLink = document.querySelector('[data-contact="phone"]');
phoneLink.href = 'tel:' + CONTACT.phone.replace(/[^\d+]/g, '');
document.querySelector('[data-contact-label="phone"]').textContent = CONTACT.phone;
document.querySelector('[data-contact="telegram"]').href = 'https://t.me/' + CONTACT.telegram;

// Mobile menu
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

// Nav border on scroll
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Reveal on scroll
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.feature, .steps li, .why__list li, .compare__col, .faq details').forEach((el) => {
    el.classList.add('reveal');
    io.observe(el);
  });
}

document.getElementById('year').textContent = new Date().getFullYear();
