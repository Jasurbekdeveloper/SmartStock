import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { LayoutComponent } from './layout/layout.component';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { onboardingGuard, storeUserGuard, superAdminGuard } from './core/guards/platform.guard';

export const routes: Routes = [
  // The marketing site lives separately (website/); the app itself starts at login.
  { path: '', pathMatch: 'full', redirectTo: '/auth/login' },
  { path: 'auth/login', component: LoginComponent },
  // Super admin panel: every store, subscriptions, plans.
  {
    path: 'platform',
    canActivate: [superAdminGuard],
    loadComponent: () => import('./platform/platform-layout.component').then((m) => m.PlatformLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./platform/pages/overview/platform-overview.component').then((m) => m.PlatformOverviewComponent)
      },
      {
        path: 'tenants',
        loadComponent: () =>
          import('./platform/pages/tenant-list/tenant-list.component').then((m) => m.TenantListComponent)
      },
      {
        path: 'tenants/new',
        loadComponent: () =>
          import('./platform/pages/tenant-create/tenant-create.component').then((m) => m.TenantCreateComponent)
      },
      {
        path: 'tenants/:id',
        loadComponent: () =>
          import('./platform/pages/tenant-detail/tenant-detail.component').then((m) => m.TenantDetailComponent)
      },
      {
        path: 'plans',
        loadComponent: () => import('./platform/pages/plans/plans.component').then((m) => m.PlansComponent)
      },
      {
        path: 'leads',
        loadComponent: () => import('./platform/pages/leads/leads.component').then((m) => m.LeadsComponent)
      },
      {
        path: 'site',
        loadComponent: () => import('./platform/pages/site/site-editor.component').then((m) => m.SiteEditorComponent)
      },
      {
        path: 'audit',
        loadComponent: () =>
          import('./platform/pages/audit/platform-audit.component').then((m) => m.PlatformAuditComponent)
      }
    ]
  },
  { path: 'auth/register', redirectTo: '/auth/login', pathMatch: 'full' },
  // Outside the layout so the printed receipt has no app chrome around it.
  { path: 'sales/:id/receipt', loadComponent: () => import('./sales/pages/receipt/receipt.component').then((m) => m.ReceiptComponent), canActivate: [authGuard, storeUserGuard] },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard, storeUserGuard],
    children: [
      // Access per role: see core/auth/permissions.ts (and firestore.rules for the server side).
      { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent), canActivate: [onboardingGuard, permissionGuard('reports.view')] },
      {
        path: 'onboarding',
        loadComponent: () => import('./onboarding/onboarding.component').then((m) => m.OnboardingComponent),
        canActivate: [permissionGuard('settings.manage')]
      },
      {
        path: 'products',
        children: [
          { path: 'list', loadComponent: () => import('./products/pages/product-list/product-list.component').then((m) => m.ProductListComponent), canActivate: [permissionGuard('products.view')] },
          {
            path: 'create',
            loadComponent: () =>
              import('./products/pages/product-create/product-create.component').then((m) => m.ProductCreateComponent),
            canActivate: [permissionGuard('products.manage')]
          },
          {
            path: 'quick',
            loadComponent: () =>
              import('./products/pages/product-quick/product-quick.component').then((m) => m.ProductQuickComponent),
            canActivate: [permissionGuard('products.manage')]
          },
          {
            path: 'edit/:id',
            loadComponent: () =>
              import('./products/pages/product-edit/product-edit.component').then((m) => m.ProductEditComponent),
            canActivate: [permissionGuard('products.manage')]
          },
          {
            path: 'import',
            loadComponent: () =>
              import('./products/pages/product-import/product-import.component').then((m) => m.ProductImportComponent),
            canActivate: [permissionGuard('products.manage')]
          },
          {
            path: 'categories',
            loadComponent: () => import('./products/pages/category-list/category-list.component').then((m) => m.CategoryListComponent),
            canActivate: [permissionGuard('products.manage')]
          }
        ]
      },
      {
        path: 'stock',
        canActivate: [permissionGuard('stock.manage')],
        children: [
          { path: 'in', loadComponent: () => import('./stock/pages/stock-in/stock-in.component').then((m) => m.StockInComponent) },
          { path: 'out', loadComponent: () => import('./stock/pages/stock-out/stock-out.component').then((m) => m.StockOutComponent) },
          { path: 'adjustment', loadComponent: () => import('./stock/pages/stock-adjustment/stock-adjustment.component').then((m) => m.StockAdjustmentComponent) },
          { path: 'history', loadComponent: () => import('./stock/pages/stock-history/stock-history.component').then((m) => m.StockHistoryComponent) },
          {
            path: 'expiry',
            loadComponent: () => import('./stock/pages/expiry/expiry.component').then((m) => m.ExpiryComponent)
          }
        ]
      },
      {
        path: 'finance',
        canActivate: [permissionGuard('finance.manage')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'pnl' },
          { path: 'pnl', loadComponent: () => import('./finance/pnl/pnl.component').then((m) => m.PnlComponent) },
          {
            path: 'expenses',
            loadComponent: () => import('./finance/expenses/expenses.component').then((m) => m.ExpensesComponent)
          },
          { path: 'cash', loadComponent: () => import('./finance/cashbook/cashbook.component').then((m) => m.CashbookComponent) }
        ]
      },
      { path: 'pos', loadComponent: () => import('./pos/pos.component').then((m) => m.PosComponent), canActivate: [permissionGuard('pos.sell')] },
      {
        path: 'debts',
        canActivate: [permissionGuard('debts.manage')],
        children: [
          { path: 'list', loadComponent: () => import('./debts/pages/debt-list/debt-list.component').then((m) => m.DebtListComponent) },
          { path: 'create', loadComponent: () => import('./debts/pages/debt-create/debt-create.component').then((m) => m.DebtCreateComponent) },
          { path: ':id', loadComponent: () => import('./debts/pages/debt-detail/debt-detail.component').then((m) => m.DebtDetailComponent) }
        ]
      },
      {
        path: 'sales',
        // Cashiers see only their own sales: SalesService filters, firestore.rules enforces.
        canActivate: [permissionGuard('sales.viewOwn')],
        children: [
          { path: 'history', loadComponent: () => import('./sales/pages/sales-history/sales-history.component').then((m) => m.SalesHistoryComponent) },
          { path: ':id', loadComponent: () => import('./sales/pages/sale-detail/sale-detail.component').then((m) => m.SaleDetailComponent) }
        ]
      },
      {
        path: 'statistics',
        loadComponent: () => import('./statistics/statistics.component').then((m) => m.StatisticsComponent),
        canActivate: [permissionGuard('reports.view')]
      },
      {
        path: 'customers',
        canActivate: [permissionGuard('customers.manage')],
        children: [
          { path: 'list', loadComponent: () => import('./customers/pages/customer-list/customer-list.component').then((m) => m.CustomerListComponent) },
          { path: 'create', loadComponent: () => import('./customers/pages/customer-create/customer-create.component').then((m) => m.CustomerCreateComponent) },
          { path: 'edit/:id', loadComponent: () => import('./customers/pages/customer-edit/customer-edit.component').then((m) => m.CustomerEditComponent) },
          { path: ':id', loadComponent: () => import('./customers/pages/customer-detail/customer-detail.component').then((m) => m.CustomerDetailComponent) }
        ]
      },
      {
        path: 'suppliers',
        canActivate: [permissionGuard('suppliers.manage')],
        children: [
          { path: 'list', loadComponent: () => import('./suppliers/pages/supplier-list/supplier-list.component').then((m) => m.SupplierListComponent) },
          { path: 'create', loadComponent: () => import('./suppliers/pages/supplier-create/supplier-create.component').then((m) => m.SupplierCreateComponent) },
          { path: 'edit/:id', loadComponent: () => import('./suppliers/pages/supplier-edit/supplier-edit.component').then((m) => m.SupplierEditComponent) },
          { path: ':id', loadComponent: () => import('./suppliers/pages/supplier-detail/supplier-detail.component').then((m) => m.SupplierDetailComponent) }
        ]
      },
      {
        path: 'shifts',
        canActivate: [permissionGuard('shifts.own')],
        children: [
          { path: 'open', loadComponent: () => import('./shifts/pages/shift-open/shift-open.component').then((m) => m.ShiftOpenComponent) },
          { path: 'close/:id', loadComponent: () => import('./shifts/pages/shift-close/shift-close.component').then((m) => m.ShiftCloseComponent) },
          { path: 'history', loadComponent: () => import('./shifts/pages/shift-history/shift-history.component').then((m) => m.ShiftHistoryComponent) }
        ]
      },
      { path: 'users', loadComponent: () => import('./users/pages/user-list/user-list.component').then((m) => m.UserListComponent), canActivate: [permissionGuard('users.manage')] },
      { path: 'settings', loadComponent: () => import('./settings/pages/settings-page/settings-page.component').then((m) => m.SettingsPageComponent), canActivate: [permissionGuard('settings.manage')] },
      {
        path: 'settings/subscription',
        loadComponent: () =>
          import('./settings/pages/subscription/subscription-page.component').then((m) => m.SubscriptionPageComponent),
        canActivate: [permissionGuard('subscription.manage')]
      },
      { path: 'audit-log', loadComponent: () => import('./audit-log/pages/audit-log-list/audit-log-list.component').then((m) => m.AuditLogListComponent), canActivate: [permissionGuard('auditLog.view')] }
    ]
  },
  { path: '**', redirectTo: '/dashboard' }
];
