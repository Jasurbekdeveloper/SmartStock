import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ProductListComponent } from './products/pages/product-list/product-list.component';
import { ProductCreateComponent } from './products/pages/product-create/product-create.component';
import { ProductEditComponent } from './products/pages/product-edit/product-edit.component';
import { StockInComponent } from './stock/pages/stock-in/stock-in.component';
import { StockOutComponent } from './stock/pages/stock-out/stock-out.component';
import { StockAdjustmentComponent } from './stock/pages/stock-adjustment/stock-adjustment.component';
import { StockHistoryComponent } from './stock/pages/stock-history/stock-history.component';
import { PosComponent } from './pos/pos.component';
import { DebtListComponent } from './debts/pages/debt-list/debt-list.component';
import { DebtCreateComponent } from './debts/pages/debt-create/debt-create.component';
import { DebtDetailComponent } from './debts/pages/debt-detail/debt-detail.component';
import { SalesHistoryComponent } from './sales/pages/sales-history/sales-history.component';
import { SaleDetailComponent } from './sales/pages/sale-detail/sale-detail.component';
import { ReceiptComponent } from './sales/pages/receipt/receipt.component';
import { LayoutComponent } from './layout/layout.component';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { onboardingGuard, storeUserGuard, superAdminGuard } from './core/guards/platform.guard';
import { UserListComponent } from './users/pages/user-list/user-list.component';
import { CategoryListComponent } from './products/pages/category-list/category-list.component';
import { ShiftOpenComponent } from './shifts/pages/shift-open/shift-open.component';
import { ShiftCloseComponent } from './shifts/pages/shift-close/shift-close.component';
import { ShiftHistoryComponent } from './shifts/pages/shift-history/shift-history.component';
import { CustomerListComponent } from './customers/pages/customer-list/customer-list.component';
import { CustomerCreateComponent } from './customers/pages/customer-create/customer-create.component';
import { CustomerEditComponent } from './customers/pages/customer-edit/customer-edit.component';
import { CustomerDetailComponent } from './customers/pages/customer-detail/customer-detail.component';
import { SupplierListComponent } from './suppliers/pages/supplier-list/supplier-list.component';
import { SupplierCreateComponent } from './suppliers/pages/supplier-create/supplier-create.component';
import { SupplierEditComponent } from './suppliers/pages/supplier-edit/supplier-edit.component';
import { SupplierDetailComponent } from './suppliers/pages/supplier-detail/supplier-detail.component';
import { SettingsPageComponent } from './settings/pages/settings-page/settings-page.component';
import { AuditLogListComponent } from './audit-log/pages/audit-log-list/audit-log-list.component';

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
  { path: 'sales/:id/receipt', component: ReceiptComponent, canActivate: [authGuard, storeUserGuard] },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard, storeUserGuard],
    children: [
      // Access per role: see core/auth/permissions.ts (and firestore.rules for the server side).
      { path: 'dashboard', component: DashboardComponent, canActivate: [onboardingGuard, permissionGuard('reports.view')] },
      {
        path: 'onboarding',
        loadComponent: () => import('./onboarding/onboarding.component').then((m) => m.OnboardingComponent),
        canActivate: [permissionGuard('settings.manage')]
      },
      {
        path: 'products',
        children: [
          { path: 'list', component: ProductListComponent, canActivate: [permissionGuard('products.view')] },
          { path: 'create', component: ProductCreateComponent, canActivate: [permissionGuard('products.manage')] },
          { path: 'edit/:id', component: ProductEditComponent, canActivate: [permissionGuard('products.manage')] },
          {
            path: 'import',
            loadComponent: () =>
              import('./products/pages/product-import/product-import.component').then((m) => m.ProductImportComponent),
            canActivate: [permissionGuard('products.manage')]
          },
          {
            path: 'categories',
            component: CategoryListComponent,
            canActivate: [permissionGuard('products.manage')]
          }
        ]
      },
      {
        path: 'stock',
        canActivate: [permissionGuard('stock.manage')],
        children: [
          { path: 'in', component: StockInComponent },
          { path: 'out', component: StockOutComponent },
          { path: 'adjustment', component: StockAdjustmentComponent },
          { path: 'history', component: StockHistoryComponent }
        ]
      },
      { path: 'pos', component: PosComponent, canActivate: [permissionGuard('pos.sell')] },
      {
        path: 'debts',
        canActivate: [permissionGuard('debts.manage')],
        children: [
          { path: 'list', component: DebtListComponent },
          { path: 'create', component: DebtCreateComponent },
          { path: ':id', component: DebtDetailComponent }
        ]
      },
      {
        path: 'sales',
        // Cashiers see only their own sales: SalesService filters, firestore.rules enforces.
        canActivate: [permissionGuard('sales.viewOwn')],
        children: [
          { path: 'history', component: SalesHistoryComponent },
          { path: ':id', component: SaleDetailComponent }
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
          { path: 'list', component: CustomerListComponent },
          { path: 'create', component: CustomerCreateComponent },
          { path: 'edit/:id', component: CustomerEditComponent },
          { path: ':id', component: CustomerDetailComponent }
        ]
      },
      {
        path: 'suppliers',
        canActivate: [permissionGuard('suppliers.manage')],
        children: [
          { path: 'list', component: SupplierListComponent },
          { path: 'create', component: SupplierCreateComponent },
          { path: 'edit/:id', component: SupplierEditComponent },
          { path: ':id', component: SupplierDetailComponent }
        ]
      },
      {
        path: 'shifts',
        canActivate: [permissionGuard('shifts.own')],
        children: [
          { path: 'open', component: ShiftOpenComponent },
          { path: 'close/:id', component: ShiftCloseComponent },
          { path: 'history', component: ShiftHistoryComponent }
        ]
      },
      { path: 'users', component: UserListComponent, canActivate: [permissionGuard('users.manage')] },
      { path: 'settings', component: SettingsPageComponent, canActivate: [permissionGuard('settings.manage')] },
      {
        path: 'settings/subscription',
        loadComponent: () =>
          import('./settings/pages/subscription/subscription-page.component').then((m) => m.SubscriptionPageComponent),
        canActivate: [permissionGuard('subscription.manage')]
      },
      { path: 'audit-log', component: AuditLogListComponent, canActivate: [permissionGuard('auditLog.view')] }
    ]
  },
  { path: '**', redirectTo: '/dashboard' }
];
