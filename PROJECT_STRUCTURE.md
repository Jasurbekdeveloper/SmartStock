# SmartStock - Angular POS & Inventory System

## 📋 Project Overview

SmartStock is a comprehensive Point-of-Sale (POS) and inventory management system built with Angular 21. It provides a complete solution for managing products, stock, sales, debts, and customer relationships.

## 🏗️ Project Architecture

### Folder Structure

```
src/app/
├── core/                    # Application-wide services, guards, interceptors
│   ├── guards/             # AuthGuard for route protection
│   ├── interceptors/       # JWT interceptor for API calls
│   └── services/           # Core business logic services
│       ├── auth.service.ts
│       ├── product.service.ts
│       ├── sales.service.ts
│       ├── stock.service.ts
│       └── debt.service.ts
│
├── layout/                  # Main layout components
│   ├── sidebar/            # Navigation sidebar
│   ├── header/             # App header
│   └── layout.component.ts # Main layout wrapper
│
├── auth/                    # Authentication module
│   └── login/              # Login page
│
├── dashboard/              # Dashboard module
│   └── components/         # Dashboard sub-components
│
├── products/               # Product management module
│   ├── pages/
│   │   ├── product-list/
│   │   ├── product-create/
│   │   └── product-edit/
│   └── components/
│       ├── product-form/
│       ├── product-table/
│       └── barcode-scanner/
│
├── stock/                  # Stock/Inventory management
│   ├── pages/
│   │   ├── stock-in/
│   │   └── stock-history/
│   └── components/
│       ├── stock-form/
│       ├── stock-table/
│       └── supplier-select/
│
├── pos/                    # Point of Sale - Main revenue module
│   ├── pos.component.ts    # Main POS interface
│   └── components/         # POS sub-components
│       ├── product-search/
│       ├── cart/
│       ├── cart-item/
│       ├── payment-modal/
│       └── receipt/
│
├── debts/                  # Debt/Credit management
│   ├── pages/
│   │   ├── debt-list/
│   │   └── debt-detail/
│   └── components/
│       ├── debt-payment/
│       └── customer-form/
│
├── sales/                  # Sales history & reporting
│   ├── pages/
│   │   ├── sales-history/
│   │   └── sale-detail/
│   └── components/
│       ├── sales-table/
│       └── sales-filter/
│
├── statistics/             # Analytics & reporting
│   ├── statistics.component.ts
│   └── components/
│       ├── sales-chart/
│       ├── revenue-chart/
│       └── top-products-chart/
│
├── shared/                 # Reusable components
│   └── components/
│       ├── table/
│       ├── pagination/
│       ├── search-input/
│       ├── confirm-dialog/
│       └── loading-spinner/
│
├── app.routes.ts           # Application routing
├── app.config.ts           # App configuration
├── app.ts                  # Root component
└── app.html                # Root template
```

## 🔑 Key Features

### ✅ Implemented Features

1. **Authentication**
   - Login page with mock authentication
   - JWT token management
   - Route protection with AuthGuard
   - JWT interceptor for API calls

2. **Core Services**
   - `AuthService` - User authentication and token management
   - `ProductService` - Product CRUD operations and search
   - `SalesService` - Sales transaction management
   - `StockService` - Inventory tracking
   - `DebtService` - Customer debt management

3. **Dashboard**
   - Sales statistics cards
   - Daily/total revenue display
   - Recent sales table
   - Real-time metrics

4. **Product Management**
   - List all products with barcode
   - Create new products
   - Edit existing products
   - Price and cost management
   - Product search functionality

5. **Stock Management**
   - Stock in (receiving goods from suppliers)
   - Stock history tracking
   - Supplier information
   - Cost price tracking

6. **POS System** (Main Feature)
   - Product search by name or barcode
   - Shopping cart with item management
   - Dynamic quantity and price adjustment
   - Payment method selection (Cash, Card, Check)
   - Change calculation
   - Receipt generation

7. **Debt Management**
   - Customer debt tracking
   - Debt payment processing
   - Remaining balance calculation
   - Payment history

8. **Sales Reporting**
   - Complete sales history
   - Sale detail view with receipt
   - Export to CSV
   - Payment method tracking

9. **Statistics**
   - Total sales count
   - Total revenue
   - Average order value
   - Top payment methods

10. **UI Components**
    - Loading spinner
    - Search input
    - Pagination
    - Confirm dialog

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Angular CLI 21
- npm 11.6.2+

### Installation

```bash
# Navigate to project directory
cd SmartStock

# Install dependencies
npm install

# Start development server
npm start

# Open browser and navigate to
http://localhost:4200
```

### Demo Login
- Any username and password will work (demo mode)
- Example: `admin` / `password`

## 📱 Routes

| Route | Component | Protected |
|-------|-----------|-----------|
| `/auth/login` | LoginComponent | No |
| `/dashboard` | DashboardComponent | Yes |
| `/products/list` | ProductListComponent | Yes |
| `/products/create` | ProductCreateComponent | Yes |
| `/products/edit/:id` | ProductEditComponent | Yes |
| `/stock/in` | StockInComponent | Yes |
| `/stock/history` | StockHistoryComponent | Yes |
| `/pos` | PosComponent | Yes |
| `/debts/list` | DebtListComponent | Yes |
| `/debts/:id` | DebtDetailComponent | Yes |
| `/sales/history` | SalesHistoryComponent | Yes |
| `/sales/:id` | SaleDetailComponent | Yes |
| `/statistics` | StatisticsComponent | Yes |

## 🛠️ Technology Stack

- **Framework**: Angular 21
- **Language**: TypeScript 5.9
- **Styling**: Tailwind CSS 4.1
- **HTTP Client**: Angular HttpClient
- **Forms**: Reactive Forms & Template Forms
- **Routing**: Angular Router
- **Signals**: Angular Signals API (for state management)

## 💾 State Management

Currently uses:
- **Local State**: Component signals
- **Session Storage**: Authentication tokens
- **Services**: RxJS BehaviorSubjects

## 🔐 Security

- JWT interceptor for authenticated API calls
- AuthGuard for route protection
- Token storage in localStorage
- Mock authentication (replace with real API)

## 🎨 UI/UX

- **Framework**: Tailwind CSS for responsive design
- **Icons**: Emoji icons for quick visual feedback
- **Responsive**: Mobile-friendly sidebar toggle
- **Color Scheme**: Blue primary, professional look

## 🚦 POS System Special Features

### Product Selection
- Quick search by product name or barcode
- Real-time product grid display
- Stock availability display
- Click to add to cart

### Cart Management
- Adjustable quantity
- **Dynamic price adjustment** (as requested)
- Remove items
- Cart totals

### Payment Workflow
1. Search & add products to cart
2. Review cart items and quantities
3. Click "PROCEED TO PAY"
4. Select payment method
5. Enter paid amount
6. System calculates change
7. Complete sale
8. View receipt

## 📝 Next Steps / TODO

### Backend Integration
- [ ] Replace mock services with real API calls
- [ ] Implement proper authentication with backend
- [ ] Set up database (PostgreSQL/MongoDB)
- [ ] Create REST API endpoints

### UI Library Integration
- [ ] Install PrimeNG (recommended for data tables and charts)
- [ ] Replace basic components with PrimeNG components
- [ ] Add chart library (Chart.js or ngx-charts)
- [ ] Implement DataTable for product listings

### Additional Features
- [ ] Barcode scanner integration
- [ ] Receipt printing
- [ ] Customer management UI
- [ ] Discount system
- [ ] Tax management
- [ ] Multi-currency support
- [ ] User roles & permissions
- [ ] Audit logging
- [ ] Backup & restore

### Performance
- [ ] Lazy load modules
- [ ] Implement virtual scrolling for large lists
- [ ] Add service workers for offline support
- [ ] Optimize bundle size

### Testing
- [ ] Unit tests (Vitest)
- [ ] E2E tests (Cypress or Playwright)
- [ ] Integration tests

### DevOps
- [ ] CI/CD pipeline setup (GitHub Actions)
- [ ] Docker containerization
- [ ] Production build optimization

## 🔧 Configuration Files

- `angular.json` - Angular CLI configuration
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `.postcssrc.json` - PostCSS configuration

## 📚 Services Documentation

### AuthService
```typescript
// Methods:
login(username, password): Observable
logout(): void
isAuthenticated(): boolean
getToken(): string | null
getCurrentUser(): AuthUser | null
```

### ProductService
```typescript
// Methods:
getProducts(): Observable<Product[]>
getProductById(id): Observable<Product>
searchProducts(query): Observable<Product[]>
getProductByBarcode(barcode): Observable<Product>
addProduct(product): Observable<Product>
updateProduct(id, product): Observable<Product>
deleteProduct(id): Observable<void>
```

### SalesService
```typescript
// Methods:
getSales(): Observable<Sale[]>
getSaleById(id): Observable<Sale>
createSale(sale): Observable<Sale>
```

### StockService
```typescript
// Methods:
getStockEntries(): Observable<StockEntry[]>
getStockByProductId(productId): Observable<StockEntry[]>
addStockEntry(entry): Observable<StockEntry>
```

### DebtService
```typescript
// Methods:
getDebts(): Observable<Debt[]>
getDebtById(id): Observable<Debt>
getCustomerDebts(customerId): Observable<Debt[]>
createDebt(debt): Observable<Debt>
payDebt(debtId, amount): Observable<Debt>
getCustomers(): Observable<Customer[]>
addCustomer(customer): Observable<Customer>
```

## 📧 Contact & Support

For issues or questions, please refer to the Angular documentation:
- [Angular Documentation](https://angular.dev)
- [Angular Material](https://material.angular.io)
- [Tailwind CSS](https://tailwindcss.com)

## 📄 License

This project is part of the SmartStock application suite.

---

**Last Updated**: March 7, 2026
**Version**: 1.0.0
**Status**: Development
