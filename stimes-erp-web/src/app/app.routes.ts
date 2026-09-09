import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    // Standalone print page - deliberately outside the erp-shell wrapper (no topbar/sidebar),
    // so it's just the report content, ready for the browser's own Print/Save-as-PDF dialog.
    path: 'daily-site/:id/print',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./daily-site/daily-site-print/daily-site-print.component').then(m => m.DailySitePrintComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/erp-shell.component').then(m => m.ErpShellComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./core/layout/erp-dashboard.component').then(m => m.ErpDashboardComponent)
      },
      {
        path: 'daily-site',
        loadComponent: () =>
          import('./daily-site/daily-site-list/daily-site-list.component').then(m => m.DailySiteListComponent)
      },
      {
        path: 'daily-site/:id',
        loadComponent: () =>
          import('./daily-site/daily-site-detail/daily-site-detail.component').then(m => m.DailySiteDetailComponent)
      },
      {
        path: 'store-indent',
        loadComponent: () =>
          import('./store-indent/store-indent-list/store-indent-list.component').then(m => m.StoreIndentListComponent)
      },
      {
        path: 'store-indent/:id',
        loadComponent: () =>
          import('./store-indent/store-indent-detail/store-indent-detail.component').then(m => m.StoreIndentDetailComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
