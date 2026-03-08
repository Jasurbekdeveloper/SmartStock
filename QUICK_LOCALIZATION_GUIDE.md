# 🚀 Tez Boshlash - Lokalizatsiya va Dark Mode

## 5 Daqiqada Boshlang

### 1️⃣ Headerda Tillarni o'Zgartirish

Header komponentida **🌐** tugmasini bosing va tildagi tilni o'zgartiring. Avtomatik ravishda barcha sahifalar tarjima bo'ladi!

### 2️⃣ Dark Mode o'Zgartirish

Header komponentida **🌙/☀️** tugmasini bosing. Dark mode avtomatik qo'shiladi va qoldi!

### 3️⃣ Komponentda Tarjimalarni Qo'llash

#### Option A: Template da (Tavsiyalangan)
```html
<h1>{{ 'products.title' | translate }}</h1>
<button>{{ 'common.save' | translate }}</button>
```

#### Option B: TypeScript da
```typescript
const text = this.translationService.t('products.title');
```

### 4️⃣ Yangi Tarjima Qo'shish

`src/app/core/services/translation.service.ts` fayli oching va `translations` ob'ektida yangi kalit qo'shing:

```typescript
private translations: { [key in Language]: Translations } = {
  'en': {
    common: { /* ... */ },
    myFeature: {
      newKey: 'My Translation'
    }
  },
  'ru': {
    common: { /* ... */ },
    myFeature: {
      newKey: 'Мой перевод'
    }
  },
  'uz-latin': {
    common: { /* ... */ },
    myFeature: {
      newKey: 'Mening tarjimasi'
    }
  },
  'uz-cyrillic': {
    common: { /* ... */ },
    myFeature: {
      newKey: 'Менинг таржимаси'
    }
  }
};
```

Endi shablonda `{{ 'myFeature.newKey' | translate }}` ishlatishingiz mumkin!

### 5️⃣ Dark Mode Styling

Tailwind CSS "dark:" prefix ishlating:

```html
<!-- Light: white, Dark: gray -->
<div class="bg-white dark:bg-gray-800">
  <!-- Light: black, Dark: white -->
  <p class="text-black dark:text-white">
    Matn
  </p>
</div>
```

## 📋 Til Kodlari

| Kod | Nomi |
|-----|------|
| `en` | English |
| `ru` | Русский |
| `uz-latin` | O'zbek (Latin) |
| `uz-cyrillic` | Ўзбек (Cyrillic) |

## 🎯 Eng Tez Foydalanish

### Bir componentni tarjima qilish:

```typescript
import { Component, inject } from '@angular/core';
import { TranslationService } from './core/services/translation.service';
import { TranslatePipe } from './core/pipes/translate.pipe';

@Component({
  selector: 'app-my-component',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <h1>{{ 'navigation.dashboard' | translate }}</h1>
    <button>{{ 'common.save' | translate }}</button>
  `
})
export class MyComponent {
  // Tarjima hazir ishlamoqda! ✨
}
```

### Dark mode ni qo'llash:

```html
<!-- Oq light mode -->
<div class="bg-white text-black">
  <!-- Qora dark mode -->
  <div class="dark:bg-gray-900 dark:text-white">
    Foydalanuvchi dark mode yoqlasada, bu yerda qora ko'rinadi
  </div>
</div>
```

## 🔑 Asosiy Funksiyalar

### TranslationService

```typescript
// Til o'zgartirish
service.setLanguage('ru');

// Joriy tilni olish
const lang = service.getLanguage(); // 'ru'

// Tarjima olish
const text = service.translate('common.logout'); // 'Выход'
const text2 = service.t('common.logout'); // Qisqa: 'Выход'

// Til o'zgarishini kuzatish (reactive)
service.currentLanguage$.subscribe(lang => {
  console.log('Til:', lang);
});
```

### ThemeService

```typescript
// Tema o'zgartirish
service.setTheme('dark');
service.setTheme('light');

// Almashtirish
service.toggleTheme(); // light -> dark yoki dark -> light

// Joriy temani olish
const theme = service.getTheme(); // 'dark'

// Tema o'zgarishini kuzatish (reactive)
service.currentTheme$.subscribe(theme => {
  console.log('Tema:', theme);
});
```

## 📝 Tarjima Struktura

```typescript
// translations['en']
{
  common: {
    search: 'Search',
    logout: 'Logout'
  },
  navigation: {
    dashboard: 'Dashboard',
    products: 'Products'
  },
  products: {
    title: 'Products',
    name: 'Product Name'
  }
}

// Foydalanish: 'common.search' -> 'Search'
// Foydalanish: 'products.name' -> 'Product Name'
```

## ⚡ Performance Tips

1. **Pipe ishlating** - Template da `| translate` pipe ishlatish eng tez
2. **Signal ishlating** - Reactive foydalanish uchun `currentLanguage$` va `currentTheme$`
3. **localStorage** - Avtomatik saqlash, qayta yuklashda qaytadi

## 🆘 Muammolari Hall Qilish

### Tarjima ko'rinmaydi?
```typescript
// Kalit noto'g'ri yozilgan ekanligini tekshiring
'products.name' // ✅ to'g'ri
'productsName'  // ❌ noto'g'ri - kalit mavjud emas

// Hozirgi kaltning mavjud-om yoʻqligini tekshiring
this.translationService.translate('unknown.key') // 'unknown.key' qaytaradi
```

### Dark mode qo'shilmaydi?
```html
<!-- Tailwind ning "dark:" prefixini ishlating -->
<div class="dark:bg-gray-800">...</div>

<!-- Yoki HTML elementiga jo'natilgan -->
<html class="dark">
```

### Turli till uchun font kerak?
```css
/* styles.css */
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap');

body {
  font-family: 'Nunito', sans-serif;
}
```

## 📚 Batafsil Fayllar

- `LOCALIZATION_GUIDE.md` - Toliq qo'llanma
- `MULTI_LANGUAGE_FORM_EXAMPLE.md` - Forma misollar
- `IMPLEMENTATION_SUMMARY.md` - Bajarilgan ishlari

## 🎓 Keyingi Qadamlar

1. ✅ Header tugmalarini sinab ko'ring
2. ✅ O'z komponentlaringizda tarjimalarni qo'shing
3. ✅ Dark mode styling qo'shing
4. ✅ Backend API ni 4 tilli qilish
5. ✅ Yangi tillarni qo'shish (agar kerak)

---

**Tayyor! Hozir qabul qilishni boshlashingiz mumkin.** 🎉

**Savol bo'lsa?** `LOCALIZATION_GUIDE.md` yoki `MULTI_LANGUAGE_FORM_EXAMPLE.md` fayllarga qarang.
