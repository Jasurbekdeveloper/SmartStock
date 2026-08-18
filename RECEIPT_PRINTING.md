# Chekni "silent" (dialogsiz) chop etish

Brauzer xavfsizlik siyosati tufayli veb-sahifa hech qachon foydalanuvchi
tasdig'isiz to'g'ridan-to'g'ri printerga chop eta olmaydi — `window.print()`
har doim OS/brauzer print-dialogini ochadi. Bu kodda tuzatib bo'lmaydigan
brauzer cheklovi, SmartStock buni o'zi avtomatik hal qila olmaydi.

## Amaliy yechim: kiosk-printing rejimi

Kassir kompyuterida Chrome/Edge `--kiosk-printing` bayrog'i bilan ishga
tushirilsa, `window.print()` dialogsiz, to'g'ridan-to'g'ri **standart
printerga** chop etadi. Bu bir martalik OS sozlamasi (ilovada emas).

### Windows'da sozlash

1. Kassir kompyuteridagi Chrome/Edge yorlig'iga o'ng tugma bilan bosing →
   **Properties** (Xususiyatlar).
2. **Shortcut** bo'limidagi **Target** maydonini toping — odatda:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe"`
3. Qo'shtirnoq (`"`) tugagandan keyin, bo'sh joy qoldirib qo'shing:
   `"C:\...\chrome.exe" --kiosk-printing`
4. **OK** bosing va faqat shu (o'zgartirilgan) yorliq orqali brauzerni
   oching — boshqa joydan ochilgan Chrome oddiy dialogli rejimda qoladi.

### Eslatmalar

- Windows'dagi standart printer termoprinter bo'lishi shart, aks holda
  `--kiosk-printing` xato printerga jo'natadi.
- Sinov: SmartStock'da bir sotuvni oching → "Chekni chop etish" → dialog
  chiqmasdan chop etilsa, sozlama to'g'ri ishlayapti.
