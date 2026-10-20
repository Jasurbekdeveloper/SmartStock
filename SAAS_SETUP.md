# Hisobla SaaS — ishga tushirish

Ko'p do'konli rejim: super admin (`/platform`) do'kon ochadi, obunani boshqaradi; har bir do'kon admini o'z kabinetini boshqaradi.

## 1. Qoidalar va indekslar

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 2. Mavjud "Original" do'konini birinchi tenant qilish (bir marta)

```bash
cd scripts/tenant-migration
npm install
gcloud auth application-default login
FIREBASE_PROJECT_ID=smartstock-d737f LEGACY_OWNER_UID=<egasining uid> npm run migrate
```

`paidUntil` qo'yilmagani uchun bu do'kon muddatsiz ishlaydi. Panelda unga to'lov qo'shilsa, muddat boshlanadi.

## 3. Super admin yaratish

```bash
cd scripts/tenant-migration
FIREBASE_PROJECT_ID=smartstock-d737f \
SUPER_ADMIN_EMAIL=siz@example.com SUPER_ADMIN_PASSWORD='kamida-8-belgi' SUPER_ADMIN_NAME='Ism' \
npm run create-super-admin
```

Super admin uchun do'kon xodimlaridan alohida email ishlating. Kirgandan keyin `/platform` ochiladi:
1. **Tariflar** → "Namuna tariflarni yaratish" → narxlarni kiriting.
2. **Do'konlar → Do'kon ochish** → login va parolni egasiga yuboring.

## 4. Telegram orqali kirish (ixtiyoriy)

Cloud Functions kerak, ular faqat **Blaze** (pay-as-you-go) tarifida ishlaydi.

1. @BotFather → `/newbot` → token va bot username oling.
2. @BotFather → `/setdomain` → ilova joylashgan domen (masalan `smartstock-d737f.web.app`). Widget `localhost`da ishlamaydi.
3. Tokenni secret sifatida saqlang va funksiyalarni deploy qiling:
   ```bash
   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
4. Google Cloud Console → IAM: funksiya ishlaydigan service account'ga (`<project-number>-compute@developer.gserviceaccount.com`) **Service Account Token Creator** rolini bering. Busiz `createCustomToken` ishlamaydi.
5. `src/environments/environment.ts` → `telegramBotUsername: 'bot_username'` (@ siz) → ilovani qayta build va deploy qiling.

Xodim avval login-parol bilan kiradi va profil menyusidan **Telegram'ni ulash** tugmasini bosadi. Shundan keyin login sahifasida "Telegram orqali kirish" tugmasi bilan kira oladi.

## Obuna qoidalari

| Holat | Shart | Do'konda |
|---|---|---|
| Sinov / Faol | `paidUntil` hali kelmagan | hammasi ishlaydi |
| Muddati o'tgan | `paidUntil` dan keyin 3 kun | ishlaydi, qizil ogohlantirish |
| Faqat o'qish | 3 kundan keyin | ko'rish va eksport, yozish yopiq (Rules) |
| To'xtatilgan | super admin qo'lda | kirish yopiq |

Tarif limitlari (`maxUsers`, `maxProducts`, 0 = cheksiz) xodim yoki tovar qo'shishda tekshiriladi.
