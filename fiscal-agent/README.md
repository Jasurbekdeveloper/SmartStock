# MarketHisob fiskal agenti

Har bir kassa kompyuterida ishlaydigan Windows xizmati. MarketHisob faqat shu agent API'sini taniydi, soliq provayderlari (hozir REGOS: VCR) `IFiscalProvider` ortida turadi.

```
Brauzer (MarketHisob) → http://127.0.0.1:18348/v1 → FiscalAgent → provayder
```

## Buyruqlar

Test:

```bash
dotnet test FiscalAgent.slnx
```

Soxta provayder bilan ishga tushirish (faqat Development, chek hech qayerga bormaydi):

```bash
dotnet run --project src/FiscalAgent.Host --launch-profile fake
```

Do'kon uchun yig'ish:

```bash
dotnet publish src/FiscalAgent.Host -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o publish
```

O'rnatish (administrator sifatida, `FiscalAgent.exe` yonida):

```powershell
.\install.ps1 -VcrUrl http://127.0.0.1:<VCR porti> -Login <login>
```

Parol konsolda so'raladi va Windows DPAPI bilan shifrlanib, `%ProgramData%\MarketHisob\FiscalAgent\agent.json`ga yoziladi.

## API

Pul butun tiyinda, miqdor mahsulot birligida. Xato javobi: `{ "code", "message" }`.

| So'rov | Vazifasi |
|---|---|
| `GET /v1/status` | Kassa holati |
| `POST /v1/shift/open`, `/v1/shift/close` | Fiskal smena |
| `POST /v1/receipts/sale`, `/refund`, `/credit` | Cheklar |
| `GET /v1/payments/systems` | Ulangan to'lov tizimlari |
| `POST /v1/payments`, `GET /v1/payments/{id}` | To'lov boshlash, holatini ko'rish |
| `POST /v1/payments/{id}/confirm`, `/cancel` | To'lovni tasdiqlash, bekor qilish |

Faqat `127.0.0.1`da tinglaydi. Holatni o'zgartiruvchi so'rovlar faqat MarketHisob sahifalaridan qabul qilinadi.

## Yangi provayder qo'shish

1. `src/FiscalAgent.Providers.<Nom>` loyihasida `IFiscalProvider` yozing. To'lov tizimlari bo'lsa, `IPaymentProvider` ham.
2. Provayder tanlashni `src/FiscalAgent.Host/Program.cs`ga va sozlamasini `ConfigStore.cs`ga qo'shing.

MarketHisob kodi o'zgarmaydi.

## REGOS: VCR xususiyatlari

- **Yashirilgan ma'lumot:** VCR `QRCodeURL`, `ReceiptNo` va `FiscalSign` o'rniga har doim `***` qaytaradi, haqiqiysi faqat qog'oz chekda. Agent ularni bo'sh qiymat qilib beradi.
- **Qaytarish:** qog'oz chekdagi QR kod skanerlanadi. Agent uning shu savdoga tegishliligini `Receipt.GetInfo` bilan tekshiradi.
- **Qayta urinish:** javob kelmay qolgan chekni agent o'zi qayta yubormaydi. Kassir qayta urinsa, ilova o'sha `code`ni yuboradi. VCR `701003` qaytarsa, agent chekni kod bo'yicha topadi va summasi to'g'ri kelsa, o'shani qaytaradi.
- **`704044`:** oldingi operatsiya natijasi noma'lum. Kod va chek tarkibini o'zgartirmay qayta yuborish kerak, agent buni `RECEIPT_UNCONFIRMED` deb qaytaradi.

Bu xatti-harakatlar REGOS hujjatiga asoslangan, test akkauntida hali sinalmagan.
