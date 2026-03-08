# Lokalizatsiya va Dark Mode Qo'llanmasi

## 📚 Ushbu qo'llanma

SmartStock asosiy loyihada **4 tilli lokalizatsiya** va **Dark Mode** qo'shilgan.

## 🌐 Qo'llab-quvvatlanuvchi Tillar

1. **English** (en)
2. **Русский** (ru)
3. **O'zbek (Latin)** (uz-latin)
4. **Ўзбек (Cyrillic)** (uz-cyrillic)

## 🔧 Xizmatlar (Services)

### 1. TranslationService

Barcha tillar boshqaruvi uchun foydalaniladigan xizmat.

**Foydalanish:**

```typescript
import { Component, inject } from '@angular/core';
import { TranslationService } from './core/services/translation.service';

@Component({
  selector: 'app-example',
  standalone: true,
  templateUrl: './example.component.html'
})
export class ExampleComponent {
  translationService = inject(TranslationService);

  changeLanguage() {
    this.translationService.setLanguage('uz-latin');
  }

  getCurrentText() {
    const text = this.translationService.t('common.logout');
    console.log(text);
  }
}
```

**Methodlar:**
- `setLanguage(language: Language)` - Tilni o'zgartirish
- `getLanguage(): Language` - Joriy tilni olish
- `translate(key: string): string` - Ko'chirish
- `t(key: string): string` - Qisqa alias

### 2. ThemeService

Dark mode boshqaruvi uchun xizmat.

**Foydalanish:**

```typescript
import { Component, inject } from '@angular/core';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-example',
  standalone: true,
  templateUrl: './example.component.html'
})
export class ExampleComponent {
  themeService = inject(ThemeService);

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  isDarkMode() {
    return this.themeService.getTheme() === 'dark';
  }
}
```

**Methodlar:**
- `setTheme(theme: Theme)` - Temani o'zgartirish ('light' | 'dark')
- `getTheme(): Theme` - Joriy temani olish
- `toggleTheme()` - Temani almashtirish

## 🎨 Shablonlarda (Templates) Foydalanish

### Tarjimalarni Ko'rsatish

**Method 1: Service orqali**
```html
<button>{{ translationService.t('common.logout') }}</button>
```

**Method 2: Pipe orqali**
```html
<button>{{ 'common.logout' | translate }}</button>
```

### Dark Mode Stillar

```html
<!-- Light/Dark mode uchun Tailwind klasslar -->
<div class="bg-white dark:bg-gray-800 text-black dark:text-white p-4">
  <h1 class="text-gray-900 dark:text-gray-100">Sarlavha</h1>
</div>
```

### Header Example

Header komponentida tillar va dark mode tugmalari allaqachon qo'shilgan:

```html
<!-- Tilni o'zgartirish -->
<button (click)="setLanguage('en')">English</button>
<button (click)="setLanguage('uz-latin')">O'zbek</button>

<!-- Dark mode tugmasi -->
<button (click)="toggleTheme()">
  {{ themeService.getTheme() === 'light' ? '🌙' : '☀️' }}
</button>
```

## 📝 Yangi Tillarni Qo'shish

Yangi til qo'shish uchun `TranslationService` ichida `translations` ob'ektiga yangi kalit-qiymat juftligi qo'shing:

```typescript
private translations: { [key in Language]: Translations } = {
  'en': { /* ... */ },
  'uz-latin': { /* ... */ },
  'uz-cyrillic': { /* ... */ },
  'ru': { /* ... */ },
  'new-lang': {
    // Yangi til
    common: {
      logout: 'Logout',
      // ...
    }
  }
};
```

## 📡 Backend bilan Integratsiya

### Bir til kiritilsa, 4 ta tilga tarjima qiling:

```typescript
// Misol: Mahsulot yaratish
createProduct(data: {
  name_uz_latin: string;
  name_uz_cyrillic: string;
  name_ru: string;
  name_en: string;
}) {
  // Backend chap: 1 til kiradi, 4 ta til shunaqa qilinadi
  return this.http.post('/api/products', {
    translations: {
      'uz-latin': { name: data.name_uz_latin },
      'uz-cyrillic': { name: data.name_uz_cyrillic },
      'ru': { name: data.name_ru },
      'en': { name: data.name_en }
    }
  });
}
```

**Yoki ko'chirishni backend-da qiling:**

```typescript
// Client tomonida faqat bitta til yo'llash
createProduct(name: string) {
  return this.http.post('/api/products', {
    name: name,
    language: 'uz-latin' // Jeering til
  });
  // Backend: Buni 4 ta tilga tarjima qiladi
}
```

## 🎯 Komponent Misollar

### Mahsulot Yaratish Komponentida Tarjimalar:

```typescript
// product-create.component.ts
import { Component, inject } from '@angular/core';
import { TranslationService } from '../core/services/translation.service';
import { TranslatePipe } from '../core/pipes/translate.pipe';

@Component({
  selector: 'app-product-create',
  standalone: true,
  imports: [TranslatePipe], // <- Pipe ni import qilib oling
  template: `
    <div>
      <h2>{{ 'products.addProduct' | translate }}</h2>
      <input 
        placeholder="{{ 'products.name' | translate }}"
      />
      <button>{{ 'common.save' | translate }}</button>
    </div>
  `
})
export class ProductCreateComponent {
  translationService = inject(TranslationService);
}
```

### Dark Mode qo'llab-quvvatlash:

```html
<!-- product-create.component.html -->
<div class="bg-white dark:bg-gray-800 p-6 rounded-lg">
  <h2 class="text-gray-900 dark:text-white">
    {{ 'products.addProduct' | translate }}
  </h2>
  
  <form class="space-y-4">
    <input 
      type="text"
      class="bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
      placeholder="{{ 'products.name' | translate }}"
    />
    
    <button class="bg-blue-600 dark:bg-blue-800 text-white hover:bg-blue-700 dark:hover:bg-blue-900">
      {{ 'common.save' | translate }}
    </button>
  </form>
</div>
```

## 💾 Saqlash

Foydalanuvchi tanlovlari `localStorage` da saqlanadi:
- `app_language` - Tanlangan til
- `app_theme` - Tanlangan tema (light/dark)

## 🔄 Sinxronizatsiya

Har bir komponent talabiga ko'ra:

```typescript
// Type-safe tarjima
const text: string = this.translationService.t('products.name');

// Reactive o'zgarishlar kuzating
this.translationService.currentLanguage$
  .subscribe(lang => {
    console.log('Til o'zgardi:', lang);
  });

this.themeService.currentTheme$
  .subscribe(theme => {
    console.log('Tema o'zgardi:', theme);
  });
```

## 🚀 Qo'shimcha Tavsiyalar

1. **TypeScript Support**: `Language` va `Theme` turlari type-safety uchun ishlatiladi
2. **Performance**: Signallar ang Angular 21 da optimal performance uchun
3. **Fallback**: Noto'g'ri kalit bo'lsa, kalit o'zi qaytariladi
4. **SSR Support**: Server-side rendering uchun `isPlatformBrowser` tekshirish amalga oshirilgan

---

**Header komponentida tillarni va dark mode ni almashtirish tugmalari tayyor!** 🎉
