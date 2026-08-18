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
import { roleGuard } from './core/guards/role.guard';
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
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'auth/login', component: LoginComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      {
        path: 'products',
        children: [
          { path: 'list', component: ProductListComponent },
          { path: 'create', component: ProductCreateComponent },
          { path: 'edit/:id', component: ProductEditComponent },
          {
            path: 'categories',
            component: CategoryListComponent,
            canActivate: [roleGuard('admin', 'manager')]
          }
        ]
      },
      {
        path: 'stock',
        canActivate: [roleGuard('admin', 'manager')],
        children: [
          { path: 'in', component: StockInComponent },
          { path: 'out', component: StockOutComponent },
          { path: 'adjustment', component: StockAdjustmentComponent },
          { path: 'history', component: StockHistoryComponent }
        ]
      },
      { path: 'pos', component: PosComponent },
      {
        path: 'debts',
        children: [
          { path: 'list', component: DebtListComponent },
          { path: 'create', component: DebtCreateComponent },
          { path: ':id', component: DebtDetailComponent }
        ]
      },
      {
        path: 'sales',
        children: [
          { path: 'history', component: SalesHistoryComponent },
          { path: ':id/receipt', component: ReceiptComponent },
          { path: ':id', component: SaleDetailComponent }
        ]
      },
      {
        path: 'statistics',
        loadComponent: () => import('./statistics/statistics.component').then((m) => m.StatisticsComponent)
      },
      {
        path: 'customers',
        children: [
          { path: 'list', component: CustomerListComponent },
          { path: 'create', component: CustomerCreateComponent },
          { path: 'edit/:id', component: CustomerEditComponent },
          { path: ':id', component: CustomerDetailComponent }
        ]
      },
      {
        path: 'suppliers',
        canActivate: [roleGuard('admin', 'manager')],
        children: [
          { path: 'list', component: SupplierListComponent },
          { path: 'create', component: SupplierCreateComponent },
          { path: 'edit/:id', component: SupplierEditComponent },
          { path: ':id', component: SupplierDetailComponent }
        ]
      },
      {
        path: 'shifts',
        children: [
          { path: 'open', component: ShiftOpenComponent },
          { path: 'close/:id', component: ShiftCloseComponent },
          { path: 'history', component: ShiftHistoryComponent }
        ]
      },
      { path: 'users', component: UserListComponent, canActivate: [roleGuard('admin')] },
      { path: 'settings', component: SettingsPageComponent, canActivate: [roleGuard('admin')] },
      { path: 'audit-log', component: AuditLogListComponent, canActivate: [roleGuard('admin', 'manager')] }
    ]
  },
  { path: '**', redirectTo: '/dashboard' }
];
