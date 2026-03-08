import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ProductListComponent } from './products/pages/product-list/product-list.component';
import { ProductCreateComponent } from './products/pages/product-create/product-create.component';
import { ProductEditComponent } from './products/pages/product-edit/product-edit.component';
import { StockInComponent } from './stock/pages/stock-in/stock-in.component';
import { StockHistoryComponent } from './stock/pages/stock-history/stock-history.component';
import { PosComponent } from './pos/pos.component';
import { DebtListComponent } from './debts/pages/debt-list/debt-list.component';
import { DebtDetailComponent } from './debts/pages/debt-detail/debt-detail.component';
import { SalesHistoryComponent } from './sales/pages/sales-history/sales-history.component';
import { SaleDetailComponent } from './sales/pages/sale-detail/sale-detail.component';
import { StatisticsComponent } from './statistics/statistics.component';
import { LayoutComponent } from './layout/layout.component';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'auth/login', component: LoginComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      {
        path: 'products',
        children: [
          { path: 'list', component: ProductListComponent },
          { path: 'create', component: ProductCreateComponent },
          { path: 'edit/:id', component: ProductEditComponent }
        ]
      },
      {
        path: 'stock',
        children: [
          { path: 'in', component: StockInComponent },
          { path: 'history', component: StockHistoryComponent }
        ]
      },
      { path: 'pos', component: PosComponent },
      {
        path: 'debts',
        children: [
          { path: 'list', component: DebtListComponent },
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
      { path: 'statistics', component: StatisticsComponent }
    ]
  },
  { path: '**', redirectTo: '/dashboard' }
];
