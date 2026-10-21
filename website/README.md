# MarketHisob — reklama sayti

Statik sayt (HTML/CSS/JS), build kerak emas. **Matnlar, ro'yxatlar, aloqa, bo'limlar va narxlar super admin panelidan o'zgartiriladi** — saytni qayta yuklash shart emas.

| Nima | Qayerda o'zgartiriladi |
|---|---|
| Matnlar (uz/ru/en), ro'yxatlar, telefon/Telegram, bo'limlarni yoqish/o'chirish | Panel → **Sayt** (`/platform/site`) |
| Narxlar | Panel → **Tariflar** → "Saytda ko'rsatish" |
| Demo arizalari | Panel → **Arizalar** (`/platform/leads`) + Telegram xabar |

## Qanday ishlaydi

- `content.json` — standart matnlar. Panel ham shu faylni standart sifatida ishlatadi.
- `main.js` sahifa ochilganda Firestore'dan `siteContent/main` (panelda saqlangan) va `plans` (`showOnSite: true`) ni o'qiydi va standartning ustiga qo'yadi.
- "Demo so'rash" formasi `submitLead` Cloud Function'ga yuboradi: ariza `leads` ga yoziladi va Telegram'ni ulagan super adminlarga xabar boradi.
- `index.html` dagi o'zbekcha matn faqat birinchi ko'rinish va JavaScript'siz holat uchun.

`content.json` dagi standart matnni o'zgartirsangiz, saytni qayta joylang — panel ham yangi standartni build'dan keyin ko'radi.

## Ishga tushirish

1. `firebase deploy --only firestore:rules,functions` (rules: `siteContent`, `leads`, `plans` ommaviy o'qish; functions: `submitLead`, `testLeadNotification`).
2. Panel → profil menyusi → **Telegram'ni ulash**, keyin botga `/start` yozing. Panel → Arizalar → "Telegram sinov xabari".
3. Papkani hostingga joylang (Firebase Hosting'ning alohida sayti, Netlify yoki boshqasi).

Ko'rish: papkada `npx serve .` yoki istalgan statik server (`content.json` fetch qilinadi, `file://` da ishlamaydi).
