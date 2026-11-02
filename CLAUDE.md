# MarketHisob (repo: SmartStock)

Do'konlar uchun ko'p do'konli (SaaS) POS va ombor tizimi. Foydalanuvchi bilan o'zbek tilida gaplashing.
Brend foydalanuvchiga "MarketHisob" deb ko'rinadi; ichki nomlarda `smartstock`/`hisobla` qolgan, ularni o'zgartirmang.

## Stek
Angular 21 (standalone, signals, zone.js'siz), Angular Material, Tailwind v4, Firebase (Auth, Firestore, Hosting), vitest, ngx-translate.

## Buyruqlar
- `npx ng serve` — dev server
- `npx ng test --watch=false` — testlar
- `npx ng build` — build
- `firebase deploy --only firestore:rules,firestore:indexes` — qoidalar va indekslar (avtomatik deploy bo'lmaydi)

## Ehtiyot bo'ling
- **`master`ga push jonli saytga chiqadi.** `.github/workflows/firebase-hosting-merge.yml` test, build va `app` hosting deployini avtomatik bajaradi. Foydalanuvchi so'ramasa `master`ga push qilmang.
- `npm run release` ichida eski commit xabari yozilgan va u `git add -A` qiladi. Ishlatmang.
- Parol va tokenlarni repoga yozmang: `src/environments/environment.ts` GitHub'ga boradi.
- Jonli bazada test qilmang va haqiqiy akkauntga kirmang. Emulator uchun Java kerak.

## Papkalar
- `src/app/` — ilova: `pos`, `sales`, `debts`, `stock`, `shifts`, `finance`, `platform` (super admin), `core`, `shared`
- `functions/` — Cloud Functions (Blaze tarifi kerak)
- `worker/` — Cloudflare Worker (saytdan kelgan so'rovlar)
- `website/` — marketing sayti, matnlari `content.json`da
- `bridge/` — fiskal qurilma ko'prigi
- `scripts/tenant-migration/` — ko'chirish va super admin yaratish
- Ishga tushirish qadamlari: `SAAS_SETUP.md`

## Kod qoidalari
- **Zoneless:** async callback'da oddiy field'ga yozish ekranni yangilamaydi, `signal` yoki `toSignal` ishlating. `computed` ichida oddiy field o'qimang.
- **Do'konlar ajratilgan:** har bir hujjatda `tenantId` bor. So'rov va yozishda `core/services/tenant-data.ts` (`tenantQuery`, `withTenant`) ishlating. Yangi kolleksiya `firestore.rules`ga ham qo'shiladi.
- **Pul hisobi:** faqat `core/utils/pos-math.ts` orqali, POS'da alohida formula yozmang.
- **Obuna:** `core/models/saas.ts`dagi `GRACE_DAYS` `firestore.rules`dagi `tenantWritable()` bilan bir xil bo'lishi kerak.
- **Tarjima:** yangi matn 4 ta faylga qo'shiladi: `src/assets/i18n/{uz,uz-cyrillic,ru,en}.json`.
- **Ranglar:** `src/styles.css`dagi tokenlardan foydalaning. Tailwind sinf nomini dinamik yig'mang.
- **CSS:** komponent CSS'dagi `display` Tailwind'ning `hidden`idan kuchli, bunday joyda `!hidden` yozing.
- **Numpad:** `app-numpad` jismoniy klaviaturani o'zi qabul qiladi. Ota komponent klaviaturani o'zi boshqarsa, `[keyboard]="false"` bering.
- **Mavjud `pos.card`/`cardAmount`:** ekranda "Online" deb ko'rsatiladi, moslik uchun nomi o'zgartirilmagan.
- **Sayt matni:** yangi kalit `website/content.json`ga va `website/index.html`dagi zaxira matnga qo'shiladi.

## Ishlash tartibi
- O'zgarishdan keyin test va build ishga tushiring.
- Tasdiqlanmagan narsani "tekshirildi" demang: brauzerda ko'rilmagan bo'lsa, ochiq ayting.
