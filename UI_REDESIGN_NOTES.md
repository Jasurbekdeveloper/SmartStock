# UI yangilanishi va yangi modullar (2026-10)

## Dizayn tizimi
- `src/styles.css` — yangi tokenlar ("Ledger"): teal brend, ink sidebar, Onest shrifti, `--surface/--border/--text` semantik ranglar, light/dark.
- Umumiy klasslar: `.page`, `.page-head`, `.card`, `.form-section`, `.stat`, `.tone-*`, `.badge--*`, `.chip`, `.seg`, `.search-box`, `.data-table`, `.empty-state`, `.dropzone`, `.kbd`.
- `gray-*` palitrasi tokenlarga moslangan — eski sahifalar ham yangi ranglarni oladi.
- Material mavzusi (`material-theme.scss`) teal'ga o'tkazildi. `public/logo.svg` yangi rangda (marketing sayti `website/` o'zgartirilmadi).

## Layout
- Sidebar: guruhlar (Savdo / Katalog va ombor / Moliya / Boshqaruv), joriy sahifa ochiq turadi.
- Header: salomlashish, "Qo'shish" tezkor menyusi (rolga qarab).
- Toastlar pastki burchakda, ink uslubida.

## POS
- Katalog: kartochka/ro'yxat ko'rinishi, savatdagi miqdor belgisi, muddati o'tgan tovar belgisi.
- Chakana/Ulgurji almashtirgich (F7) va `wholesaleMinQty` bo'yicha avtomatik ulgurji narx (`core/utils/price-tier.ts`).
- Smena paneli: kassadagi pul, "Kassa amali" (kirim/chiqim).
- Sotuv qatoriga `priceTier: 'wholesale'` yoziladi.

## Mahsulot kiritish
- Yangi forma: bo'limlar + yon panel (rasm drag&drop, jonli ko'rinish, foyda), "Saqlab, yana qo'shish".
- `ProductExtrasComponent`: ulgurji narx, birliklar jadvali, yaroqlilik muddati va partiya.
- `/products/quick` — skaner bilan tez kiritish (bor bo'lsa kirim, yo'q bo'lsa yangi mahsulot).
- Product modeli: `wholesalePrice`, `wholesaleMinQty`, `expiryDate`, `batchNo`.

## Moliya (`finance.manage` huquqi — manager va admin)
- `/finance/pnl` — foyda-zarar: tushum → tannarx → yalpi foyda → xarajatlar → sof foyda, grafik, Excel.
- `/finance/expenses` — xarajatlar (toifalar), kassadan to'lash imkoni.
- `/finance/cash` — kassa daftari (cashMovements).
- `/stock/expiry` — yaroqlilik muddati nazorati.
- Smena Z-hisoboti kassa kirim/chiqimini hisobga oladi (`cashInTotal`, `cashOutTotal`).

## Deploy oldidan
1. `npm install --legacy-peer-deps` (package-lock'dagi @angular/service-worker peer ziddiyati sababli).
2. `firebase deploy --only firestore:rules,firestore:indexes` — yangi `expenses`, `cashMovements` qoidalari va indekslari.
3. Testlar: `ng test` (126 ta), build: `ng build`.
