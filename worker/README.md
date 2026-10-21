# Arizalar Worker'i (Cloudflare)

Saytdagi "Demo so'rash" formasini qabul qiladi: tekshiradi, bir IP'dan soatiga 5 tadan ko'p yubortirmaydi, Telegram'ga xabar yuboradi va arizani Firestore `leads` kolleksiyasiga yozadi. Bu Cloudflare Workers'ning bepul tarifida ishlaydi, karta kerak emas. Firebase Cloud Functions esa Blaze tarifini (oldindan $30) talab qiladi.

Tekshiruv va Telegram xabari matni `functions/lead.js` bilan umumiy.

## Bir marta sozlash

1. https://dash.cloudflare.com/sign-up — bepul akkaunt oching va emailni tasdiqlang.
2. Telegram → @BotFather → `/newbot` → bot nomi → **token**ni saqlang.
3. Yangi botingizga `/start` yozing (busiz bot sizga xabar yubora olmaydi).
4. Telegram → @userinfobot → `/start` → u ko'rsatgan **Id** — sizning chat ID'ingiz.
5. Terminalda:
   ```bash
   cd worker
   npx wrangler login                          # brauzerda "Allow" bosing
   npx wrangler deploy                         # URL chiqaradi: https://markethisob-leads.<sizning-subdomain>.workers.dev
   npx wrangler secret put TELEGRAM_BOT_TOKEN  # 2-qadamdagi token
   npx wrangler secret put TELEGRAM_CHAT_IDS   # 4-qadamdagi ID; bir nechta bo'lsa vergul bilan: 111,222
   ```
6. Worker URL'ini `website/main.js` → `CONFIG.leadUrl` ga yozing va saytni deploy qiling: `firebase deploy --only hosting:site`.

## Keyinroq

- Domen ulangach: `wrangler.toml` → `APP_URL = "https://app.markethisob.uz"`, keyin `npx wrangler deploy`.
- Test: `cd worker && npm test` (Node 22).
- Loglar: `npx wrangler tail`.
