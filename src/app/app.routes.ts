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
import { StatisticsComponent } from './statistics/statistics.component';
import { LayoutComponent } from './layout/layout.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { UserListComponent } from './users/pages/user-list/user-list.component';
import { CategoryListComponent } from './products/pages/category-list/category-list.component';

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
          { path: ':id', component: SaleDetailComponent }
        ]
      },
      { path: 'statistics', component: StatisticsComponent },
      { path: 'users', component: UserListComponent, canActivate: [roleGuard('admin')] }
    ]
  },
  { path: '**', redirectTo: '/dashboard' }
];
