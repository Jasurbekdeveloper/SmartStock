# Multi-Language Form Example

Bu fayl yangi formalarni 4 tilda qanday qilib yaratishni ko'rsatadi.

## 📝 Mahsulot Yaratish Formasida Misol

### 1. Komponent TypeScript fayli

```typescript
// product-create.component.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../core/services/translation.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { ProductService } from '../../core/services/product.service';

interface ProductForm {
  names: {
    'en': string;
    'ru': string;
    'uz-latin': string;
    'uz-cyrillic': string;
  };
  barcode: string;
  price: number;
  cost: number;
  quantity: number;
  category: string;
  descriptions: {
    'en': string;
    'ru': string;
    'uz-latin': string;
    'uz-cyrillic': string;
  };
}

@Component({
  selector: 'app-product-create',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './product-create.component.html',
  styleUrl: './product-create.component.css'
})
export class ProductCreateComponent implements OnInit {
  translationService = inject(TranslationService);
  productService = inject(ProductService);

  currentLanguage = this.translationService.getLanguage();
  
  product: ProductForm = {
    names: {
      'en': '',
      'ru': '',
      'uz-latin': '',
      'uz-cyrillic': ''
    },
    barcode: '',
    price: 0,
    cost: 0,
    quantity: 0,
    category: '',
    descriptions: {
      'en': '',
      'ru': '',
      'uz-latin': '',
      'uz-cyrillic': ''
    }
  };

  languages = [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
    { code: 'uz-latin', name: "O'zbek (Latin)" },
    { code: 'uz-cyrillic', name: 'Ўзбек (Cyrillic)' }
  ] as const;

  ngOnInit() {
    this.translationService.currentLanguage$.subscribe(lang => {
      this.currentLanguage = lang;
    });
  }

  saveProduct() {
    // Barcha 4 til maydonlari bilan backend ga yu'borish
    const payload = {
      names: this.product.names,
      barcode: this.product.barcode,
      price: this.product.price,
      cost: this.product.cost,
      quantity: this.product.quantity,
      category: this.product.category,
      descriptions: this.product.descriptions
    };

    this.productService.createProduct(payload).subscribe(
      response => {
        alert('Mahsulot muvaffaqiyatli qo\'shildi!');
      },
      error => {
        alert('Xatolik yuz berdi!');
      }
    );
  }
}
```

### 2. Komponent HTML faili

```html
<!-- product-create.component.html -->
<div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
  <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
    {{ 'products.addProduct' | translate }}
  </h2>

  <form (ngSubmit)="saveProduct()" class="space-y-6">
    <!-- Har bir til uchun nom maydoni -->
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300">
        Mahsulot Nomlari
      </h3>
      
      <div *ngFor="let lang of languages" class="form-group">
        <label 
          [for]="'name_' + lang.code"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {{ lang.name }} - {{ 'products.name' | translate }}
        </label>
        <input
          [id]="'name_' + lang.code"
          type="text"
          [(ngModel)]="product.names[lang.code]"
          [name]="'name_' + lang.code"
          placeholder="{{ lang.name }} da mahsulot nomini kiriting"
          class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
        />
      </div>
    </div>

    <!-- Barcode -->
    <div class="form-group">
      <label 
        for="barcode"
        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {{ 'products.barcode' | translate }}
      </label>
      <input
        id="barcode"
        type="text"
        [(ngModel)]="product.barcode"
        name="barcode"
        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
               bg-white dark:bg-gray-700 text-gray-900 dark:text-white
               focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
      />
    </div>

    <!-- Narx -->
    <div class="grid grid-cols-2 gap-4">
      <div class="form-group">
        <label 
          for="price"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {{ 'products.price' | translate }}
        </label>
        <input
          id="price"
          type="number"
          [(ngModel)]="product.price"
          name="price"
          step="0.01"
          class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
        />
      </div>

      <div class="form-group">
        <label 
          for="cost"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {{ 'products.cost' | translate }}
        </label>
        <input
          id="cost"
          type="number"
          [(ngModel)]="product.cost"
          name="cost"
          step="0.01"
          class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
        />
      </div>
    </div>

    <!-- Miqdor -->
    <div class="form-group">
      <label 
        for="quantity"
        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {{ 'products.quantity' | translate }}
      </label>
      <input
        id="quantity"
        type="number"
        [(ngModel)]="product.quantity"
        name="quantity"
        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
               bg-white dark:bg-gray-700 text-gray-900 dark:text-white
               focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
      />
    </div>

    <!-- Kategoriya -->
    <div class="form-group">
      <label 
        for="category"
        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {{ 'products.category' | translate }}
      </label>
      <input
        id="category"
        type="text"
        [(ngModel)]="product.category"
        name="category"
        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
               bg-white dark:bg-gray-700 text-gray-900 dark:text-white
               focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
      />
    </div>

    <!-- Tavsiflar (har bir til) -->
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300">
        Mahsulot Tavsifilar
      </h3>
      
      <div *ngFor="let lang of languages" class="form-group">
        <label 
          [for]="'description_' + lang.code"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {{ lang.name }} - {{ 'products.description' | translate }}
        </label>
        <textarea
          [id]="'description_' + lang.code"
          [(ngModel)]="product.descriptions[lang.code]"
          [name]="'description_' + lang.code"
          rows="3"
          placeholder="{{ lang.name }} da tavsif kiriting"
          class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
        ></textarea>
      </div>
    </div>

    <!-- Tugmalar -->
    <div class="flex gap-4">
      <button
        type="submit"
        class="flex-1 bg-blue-600 dark:bg-blue-800 text-white py-2 rounded-lg
               hover:bg-blue-700 dark:hover:bg-blue-900 transition-colors font-medium"
      >
        {{ 'common.save' | translate }}
      </button>
      <button
        type="button"
        class="flex-1 bg-gray-400 dark:bg-gray-600 text-white py-2 rounded-lg
               hover:bg-gray-500 dark:hover:bg-gray-700 transition-colors font-medium"
      >
        {{ 'common.cancel' | translate }}
      </button>
    </div>
  </form>
</div>
```

## 🔄 Backend API Endpoint

```typescript
// Backend sida: POST /api/products

// Frontend jo'natadi:
{
  names: {
    "en": "Laptop",
    "ru": "Ноутбук",
    "uz-latin": "Noutbuk",
    "uz-cyrillic": "Ноутбук"
  },
  barcode: "123456789",
  price: 1000,
  cost: 700,
  quantity: 50,
  category: "Electronics",
  descriptions: {
    "en": "High performance laptop",
    "ru": "Высокопроизводительный ноутбук",
    "uz-latin": "Yuqori samarali noutbuk",
    "uz-cyrillic": "Юқори самарали ноутбук"
  }
}

// Backend qaytaradi:
{
  id: "prod_123",
  names: { ... },
  descriptions: { ... },
  barcode: "123456789",
  price: 1000,
  cost: 700,
  quantity: 50,
  category: "Electronics",
  createdAt: "2024-03-08T10:30:00Z"
}
```

## 📋 Dark Mode Klasslar

Tailwind CSS dark mode klasslarini foydalanish:

```html
<!-- Light mode (default) -->
<div class="bg-white text-black border-gray-300">

<!-- Dark mode (avtomatik qo'shiladi) -->
<div class="bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-600">
```

## 🎯 Eng Muhim Narsalar

1. ✅ **Form maydoni har bir til uchun alohida** - names, descriptions
2. ✅ **Backend 4 ta tilning barchasini qabul qiladi** - CREATE, READ, UPDATE
3. ✅ **Dark mode klasslar qo'shilgan** - `dark:` prefix bilan
4. ✅ **TranslatePipe ishlatilmoqda** - `{{ 'key' | translate }}`
5. ✅ **Type-safe** - TypeScript `as const` bilan

---

**Endi yangi formalar 4 tilda toliq ishlaydigan qilib qo'shishingiz mumkin!** 🚀
