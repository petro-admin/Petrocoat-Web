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
    path: 'vehicle-service-repair/:id/print',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./vehicle-service-repair/vehicle-service-repair-print/vehicle-service-repair-print.component').then(m => m.VehicleServiceRepairPrintComponent)
  },
  {
    path: 'dsr-time-sheet/:id/print',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dsr-time-sheet/dsr-time-sheet-print/dsr-time-sheet-print.component').then(m => m.DsrTimeSheetPrintComponent)
  },
  {
    // Must come before the shell's 'dsr-time-sheet/:id' child route, so ":id" never tries to
    // match the literal segment "print-multi" - see "Print Selected" on the DSR list.
    path: 'dsr-time-sheet/print-multi',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dsr-time-sheet/dsr-time-sheet-print-multi/dsr-time-sheet-print-multi.component').then(m => m.DsrTimeSheetPrintMultiComponent)
  },
  {
    path: 'leave-application/:id/print',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./leave-application/leave-application-print/leave-application-print.component').then(m => m.LeaveApplicationPrintComponent)
  },
  {
    path: 'resource-return/:id/print',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./resource-return/resource-return-print/resource-return-print.component').then(m => m.ResourceReturnPrintComponent)
  },
  {
    path: 'trip-sheet/:id/print',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./trip-sheet/trip-sheet-print/trip-sheet-print.component').then(m => m.TripSheetPrintComponent)
  },
  {
    path: 'accounts/voucher/:id/print',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./accounts/voucher-print/voucher-print.component').then(m => m.VoucherPrintComponent)
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
        path: 'general/appearance',
        loadComponent: () =>
          import('./general/appearance-settings/appearance-settings.component').then(m => m.AppearanceSettingsComponent)
      },
      {
        path: 'audit-log',
        loadComponent: () =>
          import('./audit-log/audit-log-list/audit-log-list.component').then(m => m.AuditLogListComponent)
      },
      {
        path: 'notification-settings',
        loadComponent: () =>
          import('./notification-settings/notification-settings-list/notification-settings-list.component').then(m => m.NotificationSettingsListComponent)
      },
      {
        path: 'notification-settings/:id',
        loadComponent: () =>
          import('./notification-settings/notification-settings-detail/notification-settings-detail.component').then(m => m.NotificationSettingsDetailComponent)
      },
      {
        path: 'material-expiry-report',
        loadComponent: () =>
          import('./material-expiry-report/material-expiry-report-list/material-expiry-report-list.component').then(m => m.MaterialExpiryReportListComponent)
      },
      {
        path: 'resource-report',
        loadComponent: () =>
          import('./resource-report/resource-report-list/resource-report-list.component').then(m => m.ResourceReportListComponent)
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
        path: 'manpower-schedule',
        loadComponent: () =>
          import('./manpower-schedule/manpower-schedule-list/manpower-schedule-list.component').then(m => m.ManpowerScheduleListComponent)
      },
      {
        path: 'manpower-schedule/:id',
        loadComponent: () =>
          import('./manpower-schedule/manpower-schedule-detail/manpower-schedule-detail.component').then(m => m.ManpowerScheduleDetailComponent)
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
      },
      {
        path: 'vehicle-service-repair',
        loadComponent: () =>
          import('./vehicle-service-repair/vehicle-service-repair-list/vehicle-service-repair-list.component').then(m => m.VehicleServiceRepairListComponent)
      },
      {
        path: 'vehicle-service-repair/:id',
        loadComponent: () =>
          import('./vehicle-service-repair/vehicle-service-repair-detail/vehicle-service-repair-detail.component').then(m => m.VehicleServiceRepairDetailComponent)
      },
      {
        path: 'trip-sheet',
        loadComponent: () =>
          import('./trip-sheet/trip-sheet-list/trip-sheet-list.component').then(m => m.TripSheetListComponent)
      },
      {
        // Must come before 'trip-sheet/:id' so "report" isn't matched as an :id.
        path: 'trip-sheet/report',
        loadComponent: () =>
          import('./trip-sheet/trip-sheet-report/trip-sheet-report.component').then(m => m.TripSheetReportComponent)
      },
      {
        // Must also come before 'trip-sheet/:id' for the same reason.
        path: 'trip-sheet/gps-report',
        loadComponent: () =>
          import('./trip-sheet/trip-sheet-gps-report/trip-sheet-gps-report.component').then(m => m.TripSheetGpsReportComponent)
      },
      {
        path: 'trip-sheet/:id',
        loadComponent: () =>
          import('./trip-sheet/trip-sheet-detail/trip-sheet-detail.component').then(m => m.TripSheetDetailComponent)
      },
      {
        path: 'labour-attendance',
        loadComponent: () =>
          import('./labour-attendance/labour-attendance.component').then(m => m.LabourAttendanceComponent)
      },
      {
        path: 'labour-attendance/report',
        loadComponent: () =>
          import('./labour-attendance/labour-attendance-report/labour-attendance-report.component').then(m => m.LabourAttendanceReportComponent)
      },
      {
        path: 'staff-attendance',
        loadComponent: () =>
          import('./staff-attendance/staff-attendance.component').then(m => m.StaffAttendanceComponent)
      },
      {
        path: 'leave-application',
        loadComponent: () =>
          import('./leave-application/leave-application-list/leave-application-list.component').then(m => m.LeaveApplicationListComponent)
      },
      {
        path: 'leave-application/:id',
        loadComponent: () =>
          import('./leave-application/leave-application-detail/leave-application-detail.component').then(m => m.LeaveApplicationDetailComponent)
      },
      {
        path: 'resource-return',
        loadComponent: () =>
          import('./resource-return/resource-return-list/resource-return-list.component').then(m => m.ResourceReturnListComponent)
      },
      {
        path: 'resource-return/:id',
        loadComponent: () =>
          import('./resource-return/resource-return-detail/resource-return-detail.component').then(m => m.ResourceReturnDetailComponent)
      },
      {
        path: 'accident-report',
        loadComponent: () =>
          import('./accident-report/accident-report-list/accident-report-list.component').then(m => m.AccidentReportListComponent)
      },
      {
        path: 'accident-report/:id',
        loadComponent: () =>
          import('./accident-report/accident-report-detail/accident-report-detail.component').then(m => m.AccidentReportDetailComponent)
      },
      {
        path: 'vehicle-handover',
        loadComponent: () =>
          import('./vehicle-handover/vehicle-handover-list/vehicle-handover-list.component').then(m => m.VehicleHandoverListComponent)
      },
      {
        path: 'dsr-time-sheet',
        loadComponent: () =>
          import('./dsr-time-sheet/dsr-time-sheet-list/dsr-time-sheet-list.component').then(m => m.DsrTimeSheetListComponent)
      },
      {
        path: 'dsr-time-sheet/:id',
        loadComponent: () =>
          import('./dsr-time-sheet/dsr-time-sheet-detail/dsr-time-sheet-detail.component').then(m => m.DsrTimeSheetDetailComponent)
      },
      {
        path: 'vehicle-handover/:id',
        loadComponent: () =>
          import('./vehicle-handover/vehicle-handover-detail/vehicle-handover-detail.component').then(m => m.VehicleHandoverDetailComponent)
      },
      {
        path: 'accounts/account-head',
        loadComponent: () =>
          import('./accounts/account-head-list/account-head-list.component').then(m => m.AccountHeadListComponent)
      },
      {
        path: 'accounts/account-head/:id',
        loadComponent: () =>
          import('./accounts/account-head-detail/account-head-detail.component').then(m => m.AccountHeadDetailComponent)
      },
      {
        path: 'accounts/voucher',
        loadComponent: () =>
          import('./accounts/voucher-list/voucher-list.component').then(m => m.VoucherListComponent)
      },
      {
        path: 'accounts/voucher/:id',
        loadComponent: () =>
          import('./accounts/voucher-detail/voucher-detail.component').then(m => m.VoucherDetailComponent)
      },
      {
        path: 'accounts/payment',
        loadComponent: () =>
          import('./accounts/payment-voucher-list/payment-voucher-list.component').then(m => m.PaymentVoucherListComponent)
      },
      {
        path: 'accounts/payment/:id',
        loadComponent: () =>
          import('./accounts/payment-voucher-detail/payment-voucher-detail.component').then(m => m.PaymentVoucherDetailComponent)
      },
      {
        path: 'accounts/receipt',
        loadComponent: () =>
          import('./accounts/receipt-voucher-list/receipt-voucher-list.component').then(m => m.ReceiptVoucherListComponent)
      },
      {
        path: 'accounts/receipt/:id',
        loadComponent: () =>
          import('./accounts/receipt-voucher-detail/receipt-voucher-detail.component').then(m => m.ReceiptVoucherDetailComponent)
      },
      {
        path: 'accounts/contra',
        loadComponent: () =>
          import('./accounts/contra-voucher-list/contra-voucher-list.component').then(m => m.ContraVoucherListComponent)
      },
      {
        path: 'accounts/contra/:id',
        loadComponent: () =>
          import('./accounts/contra-voucher-detail/contra-voucher-detail.component').then(m => m.ContraVoucherDetailComponent)
      },
      {
        path: 'accounts/petty-cash',
        loadComponent: () =>
          import('./accounts/petty-cash-list/petty-cash-list.component').then(m => m.PettyCashListComponent)
      },
      {
        path: 'accounts/petty-cash/:id',
        loadComponent: () =>
          import('./accounts/petty-cash-detail/petty-cash-detail.component').then(m => m.PettyCashDetailComponent)
      },
      {
        path: 'accounts/employee-payment',
        loadComponent: () =>
          import('./accounts/employee-payment-list/employee-payment-list.component').then(m => m.EmployeePaymentListComponent)
      },
      {
        path: 'accounts/employee-payment/:id',
        loadComponent: () =>
          import('./accounts/employee-payment-detail/employee-payment-detail.component').then(m => m.EmployeePaymentDetailComponent)
      },
      {
        path: 'accounts/petty-cash-payment',
        loadComponent: () =>
          import('./accounts/petty-cash-payment-list/petty-cash-payment-list.component').then(m => m.PettyCashPaymentListComponent)
      },
      {
        path: 'accounts/petty-cash-payment/:id',
        loadComponent: () =>
          import('./accounts/petty-cash-payment-detail/petty-cash-payment-detail.component').then(m => m.PettyCashPaymentDetailComponent)
      },
      {
        path: 'accounts/sales-invoice',
        loadComponent: () =>
          import('./accounts/sales-invoice-list/sales-invoice-list.component').then(m => m.SalesInvoiceListComponent)
      },
      {
        path: 'accounts/sales-invoice/:id',
        loadComponent: () =>
          import('./accounts/sales-invoice-detail/sales-invoice-detail.component').then(m => m.SalesInvoiceDetailComponent)
      },
      {
        path: 'accounts/purchase-invoice',
        loadComponent: () =>
          import('./accounts/purchase-invoice-list/purchase-invoice-list.component').then(m => m.PurchaseInvoiceListComponent)
      },
      {
        path: 'accounts/purchase-invoice/:id',
        loadComponent: () =>
          import('./accounts/purchase-invoice-detail/purchase-invoice-detail.component').then(m => m.PurchaseInvoiceDetailComponent)
      },
      {
        path: 'accounts/ledger',
        loadComponent: () =>
          import('./accounts/ledger-report/ledger-report.component').then(m => m.LedgerReportComponent)
      },
      {
        path: 'accounts/trial-balance',
        loadComponent: () =>
          import('./accounts/trial-balance-report/trial-balance-report.component').then(m => m.TrialBalanceReportComponent)
      },
      {
        path: 'accounts/balance-sheet',
        loadComponent: () =>
          import('./accounts/balance-sheet-report/balance-sheet-report.component').then(m => m.BalanceSheetReportComponent)
      },
      {
        path: 'accounts/profit-loss',
        loadComponent: () =>
          import('./accounts/profit-loss-report/profit-loss-report.component').then(m => m.ProfitLossReportComponent)
      },
      {
        path: 'accounts/cost-center',
        loadComponent: () =>
          import('./accounts/cost-center-list/cost-center-list.component').then(m => m.CostCenterListComponent)
      },
      {
        path: 'accounts/cost-center/:id',
        loadComponent: () =>
          import('./accounts/cost-center-detail/cost-center-detail.component').then(m => m.CostCenterDetailComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
