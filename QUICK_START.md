# SmartStock - Quick Start Guide

## 🎯 Quick Overview

SmartStock is now fully set up with a complete modular Angular architecture. Below is a quick reference for what's implemented and how to use it.

## 🚀 Getting Started (5 minutes)

### 1. Start Development Server
```bash
npm start
```
Then visit: `http://localhost:4200`

### 2. Login
- **URL**: http://localhost:4200/auth/login
- **Any username/password works** (demo mode)
- Example: `admin` / `admin`

### 3. Main Navigation
After login, use the sidebar to navigate between:
- 📊 Dashboard
- 🛒 POS
- 📦 Products
- 📥 Stock
- 💳 Debts
- 📈 Statistics

## 📱 Main Features Quick Access

### POS (Point of Sale) - Main Feature ⭐
**Route**: `/pos`

**How to use:**
1. Search for products by name or barcode
2. Click product to add to cart
3. Adjust quantity in cart
4. **Adjust price dynamically** (click price field)
5. Click "PROCEED TO PAY"
6. Select payment method
7. Enter paid amount
8. Click "Complete Sale"

**Features:**
- Real-time cart updates
- Multiple payment methods (Cash, Card, Check)
- Automatic change calculation
- Receipt display

### Dashboard
**Route**: `/dashboard`

Shows:
- 📊 Today's sales count
- 💰 Today's & total revenue
- 📦 Total orders
- 📈 Recent sales table

### Products Management
**Routes**: 
- List: `/products/list`
- Create: `/products/create`
- Edit: `/products/edit/:id`

**Features:**
- Full CRUD operations
- Search by name
- Barcode management
- Price & cost tracking

### Stock Management
**Routes**:
- Stock In: `/stock/in`
- History: `/stock/history`

**Features:**
- Record incoming stock
- Track supplier information
- Cost price management
- Complete stock history

### Debts Management
**Routes**:
- List: `/debts/list` (or `/debts`)
- Detail: `/debts/:id`

**Features:**
- Track customer debts
- Process payments
- View remaining balance
- Payment history

### Sales History
**Route**: `/sales/history`

**Features:**
- Complete sales records
- Export to CSV
- Filter by date range
- View individual sale receipts

### Statistics
**Route**: `/statistics`

Shows:
- Total sales count
- Total revenue
- Average order value
- Top payment methods

## 🔧 Project Structure Quick Reference

```
src/app/
├── core/              ← Business logic (services, guards, interceptors)
├── layout/            ← Main UI layout (header, sidebar)
├── auth/              ← Login page
├── dashboard/         ← Dashboard
├── products/          ← Product management
├── stock/             ← Stock/inventory
├── pos/               ← POS system (MOST IMPORTANT)
├── debts/             ← Debt tracking
├── sales/             ← Sales reports
├── statistics/        ← Analytics
└── shared/            ← Reusable components
```

## 💻 Available Services

All services are in `src/app/core/services/`:

### AuthService
```typescript
// Check if user is logged in
isAuthenticated(): boolean

// Login
login(username, password): Observable

// Logout
logout(): void
```

### ProductService
```typescript
// Get all products
getProducts(): Observable<Product[]>

// Search products
searchProducts(query): Observable<Product[]>

// Find by barcode
getProductByBarcode(barcode): Observable<Product>

// CRUD operations
addProduct(product): Observable
updateProduct(id, product): Observable
deleteProduct(id): Observable
```

### SalesService
```typescript
// Get all sales
getSales(): Observable<Sale[]>

// Create sale
createSale(sale): Observable
```

### StockService
```typescript
// Get stock entries
getStockEntries(): Observable<StockEntry[]>

// Add stock
addStockEntry(entry): Observable
```

### DebtService
```typescript
// Get debts
getDebts(): Observable<Debt[]>

// Process debt payment
payDebt(debtId, amount): Observable

// Manage customers
getCustomers(): Observable<Customer[]>
```

## 🎨 Styling

The project uses **Tailwind CSS v4.1** for styling:
- Responsive design
- Mobile-first approach
- Utility-first CSS
- Dark mode ready

## 🔐 Authentication

**Current Setup (Demo Mode):**
- Any username/password works
- JWT token stored in localStorage
- Token auto-injected in API calls via interceptor
- AuthGuard protects all routes except login

**Future Setup:**
- Replace mock auth with real API
- Implement proper backend authentication
- Add role-based access control

## 🛠️ Common Tasks

### Add a New Component
```bash
# Components are standalone, so just create files in the right folder
# E.g., src/app/products/pages/new-page/
```

### Add a New Service
```typescript
// Create in src/app/core/services/
// Import and inject in components via dependency injection
constructor(private myService: MyService) {}
```

### Add a New Route
```typescript
// Edit src/app/app.routes.ts
// Add route object to routes array
```

### Modify Product Form
```typescript
// Edit src/app/products/pages/product-create/product-create.component.ts
// Or src/app/products/pages/product-edit/product-edit.component.ts
```

### Style a Component
```typescript
// Add styleUrl to @Component decorator
// Create separate .css or .scss file
// Use Tailwind classes in template
```

## 📊 Key Data Models

### Product
```typescript
{
  id: string,
  name: string,
  barcode: string,
  price: number,
  cost: number,
  quantity: number,
  unit: string,
  category: string,
  description?: string
}
```

### Sale
```typescript
{
  id: string,
  items: SaleItem[],
  subtotal: number,
  tax: number,
  total: number,
  paymentMethod: 'cash' | 'card' | 'check',
  paidAmount: number,
  change: number,
  createdAt: Date
}
```

### Debt
```typescript
{
  id: string,
  customerId: string,
  totalAmount: number,
  paidAmount: number,
  remainingAmount: number,
  createdAt: Date,
  lastPaymentDate?: Date
}
```

## ⚡ Performance Tips

1. **Use signals** for component state (already implemented)
2. **Lazy load modules** for better initial load time
3. **Unsubscribe** from observables in ngOnDestroy
4. **Track by** in *ngFor loops for large lists
5. **OnPush** change detection for performance

## 🐛 Debugging

### Check Console
- Open F12 → Console tab
- Check for errors

### Network Tab
- Monitor API calls (when connected to backend)
- Check response status codes

### Angular DevTools
- Install Angular DevTools Chrome extension
- Inspect component tree
- View service data

## 📚 Additional Resources

- [Angular Docs](https://angular.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [RxJS](https://rxjs.dev)
- [TypeScript](https://www.typescriptlang.org)

## 🎯 Next Steps

1. **Connect to Backend**
   - Update services to call real APIs
   - Implement proper authentication

2. **Add Charts/Reports**
   - Install PrimeNG or Chart.js
   - Create analytics dashboards

3. **Enhance POS**
   - Add barcode scanner support
   - Receipt printing
   - Customer selection
   - Discount codes

4. **Role-Based Access**
   - Admin users
   - Cashier users
   - Manager users
   - Permissions system

5. **Testing**
   - Unit tests
   - E2E tests
   - Integration tests

---

**Happy coding! 🚀**
