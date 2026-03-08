# Setup & Installation Guide

## ✅ What's Included

The SmartStock project now includes:

### ✨ Complete Module Structure
- ✅ Core Module (services, guards, interceptors)
- ✅ Layout Module (header, sidebar)
- ✅ Auth Module (login)
- ✅ Dashboard Module
- ✅ Products Module (CRUD)
- ✅ Stock Module (inventory)
- ✅ **POS Module (Main - with dynamic pricing)**
- ✅ Debts Module
- ✅ Sales Module
- ✅ Statistics Module
- ✅ Shared Components

### 🔧 Services
- ✅ AuthService (authentication & JWT)
- ✅ ProductService (product management)
- ✅ SalesService (sales tracking)
- ✅ StockService (inventory)
- ✅ DebtService (customer debts)

### 🛡️ Security
- ✅ AuthGuard (route protection)
- ✅ JwtInterceptor (automatic token injection)

### 🎯 Features
- ✅ Login page (demo auth)
- ✅ Dashboard with stats
- ✅ Product search
- ✅ Shopping cart with dynamic price adjustment
- ✅ POS system with payment processing
- ✅ Sales history export
- ✅ Debt management
- ✅ Stock tracking
- ✅ Statistics/reporting

---

## 🚀 Installation Steps

### Step 1: Prerequisites
Make sure you have installed:
```bash
# Check versions
node --version      # Should be 18+
npm --version       # Should be 11.6.2+
```

If not, download from: https://nodejs.org/

### Step 2: Install Dependencies
```bash
cd c:\Users\ASUS\Desktop\AngularDemo\SmartStock
npm install
```

This will install:
- Angular 21
- TypeScript 5.9
- Tailwind CSS
- RxJS
- And other dependencies

⏱️ This may take 2-5 minutes...

### Step 3: Start Development Server
```bash
npm start
```

You should see:
```
✔ Compiled successfully.
✔ Server running at http://localhost:4200/
```

### Step 4: Open in Browser
Navigate to: `http://localhost:4200`

---

## 🔐 First Login

The app has demo authentication - any username/password works:

**Example credentials:**
- Username: `admin`
- Password: `admin`

(Or use any other combination - it's all demo mode!)

---

## 📂 Project Structure Overview

After installation, here's what you have:

```
SmartStock/
├── src/
│   ├── app/
│   │   ├── core/              ← Services, guards, interceptors
│   │   ├── layout/            ← Sidebar, header
│   │   ├── auth/              ← Login page
│   │   ├── dashboard/         ← Dashboard
│   │   ├── products/          ← Product management
│   │   ├── stock/             ← Stock management
│   │   ├── pos/               ← POS system (MAIN FEATURE!)
│   │   ├── debts/             ← Debt management
│   │   ├── sales/             ← Sales reports
│   │   ├── statistics/        ← Analytics
│   │   ├── shared/            ← Shared components
│   │   ├── app.routes.ts      ← Routing
│   │   ├── app.config.ts      ← Configuration
│   │   └── app.ts             ← Root component
│   ├── main.ts
│   └── styles.css
├── angular.json
├── tailwind.config.js
├── tsconfig.json
├── package.json
├── PROJECT_STRUCTURE.md       ← Detailed structure guide
├── QUICK_START.md             ← Quick reference guide
└── README.md
```

---

## 🎯 Main Routes to Test

| Route | Purpose |
|-------|---------|
| `/auth/login` | Login page |
| `/dashboard` | Dashboard with stats |
| `/pos` | **Main POS System** |
| `/products/list` | Product list |
| `/products/create` | Add product |
| `/stock/in` | Stock intake |
| `/sales/history` | Sales records |
| `/debts` | Debt management |
| `/statistics` | Analytics |

---

## 🧪 Test the POS System

### Quick Test Walkthrough:

1. **Login** → `/auth/login` (use any credentials)

2. **Go to POS** → Click "POS" in sidebar or navigate to `/pos`

3. **Add Products**:
   - Enter product name in search box (or use a barcode)
   - Click a product to add to cart

4. **Manage Cart**:
   - Change quantity in the cart
   - **Change price dynamically** by clicking the price field
   - Remove items with ✕ button

5. **Checkout**:
   - Click "PROCEED TO PAY"
   - Select payment method
   - Enter paid amount
   - See change calculated
   - Click "Complete Sale"

6. **Verify** → Check dashboard for new sale stats

---

## 🛠️ Development Commands

```bash
# Start dev server
npm start

# Build for production
npm build

# Run tests
npm test

# Build and serve SSR
npm run serve:ssr:SmartStock
```

---

## 📦 What You Can Do Now

### Immediately:
- ✅ Test the POS system
- ✅ Create products
- ✅ View sales history
- ✅ Check dashboard stats
- ✅ Manage stock
- ✅ Track debts

### With Small Modifications:
- Add more features
- Connect to a backend API
- Customize styling
- Add reports

### With More Work:
- Add database integration
- Implement real barcode scanning
- Add printer support for receipts
- Multi-user support
- Role-based permissions

---

## 🔒 Backend Integration Guide

To connect to your own backend:

### 1. Update Services
Edit `src/app/core/services/*.service.ts`:

**Before (Mock):**
```typescript
// Returns mock data
getProducts(): Observable<Product[]> {
  return new Observable(observer => {
    observer.next(this.products$.value);
    observer.complete();
  });
}
```

**After (Real API):**
```typescript
constructor(private http: HttpClient) {}

getProducts(): Observable<Product[]> {
  return this.http.get<Product[]>('/api/products');
}
```

### 2. Update Authentication
Edit `src/app/core/services/auth.service.ts`:

**Before (Mock):**
```typescript
login(username: string, password: string): Observable<any> {
  // Mock login...
}
```

**After (Real API):**
```typescript
login(username: string, password: string): Observable<any> {
  return this.http.post('/api/auth/login', { username, password });
}
```

### 3. Update Environment
Create `src/environments/environment.ts`:

```typescript
export const environment = {
  apiUrl: 'http://localhost:3000/api',
  production: false
};
```

### 4. Use in Services
```typescript
import { environment } from '@environments/environment';

getProducts(): Observable<Product[]> {
  return this.http.get<Product[]>(`${environment.apiUrl}/products`);
}
```

---

## 📋 Installation Checklist

- [ ] Node.js 18+ installed
- [ ] npm 11.6.2+ installed
- [ ] Project code downloaded
- [ ] `npm install` completed
- [ ] `npm start` running successfully
- [ ] Browser can access http://localhost:4200
- [ ] Login successful with any credentials
- [ ] Can navigate to POS page
- [ ] Can add products to cart
- [ ] Can complete a sale

---

## ❓ Troubleshooting

### Issue: npm install fails
**Solution:**
```bash
# Clear npm cache and try again
npm cache clean --force
npm install
```

### Issue: Port 4200 already in use
**Solution:**
```bash
# Use a different port
npm start -- --port 4300
```

### Issue: Components not loading
**Solution:**
1. Check browser console (F12) for errors
2. Clear browser cache (Ctrl+Shift+Delete)
3. Restart dev server (`npm start`)

### Issue: Can't login
**Solution:**
- In demo mode, any username/password works
- Check browser console for errors
- Make sure you click the login button

---

## 📞 Support Resources

- [Angular Documentation](https://angular.dev)
- [Tailwind CSS Docs](https://tailwindcss.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [RxJS Documentation](https://rxjs.dev)

---

## 🎉 You're All Set!

The SmartStock POS system is ready to use. Start with the QUICK_START.md guide to learn the main features, then check PROJECT_STRUCTURE.md for detailed information about each module.

**Enjoy! 🚀**
