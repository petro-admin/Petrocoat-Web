import { Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { SettingsService } from '../services/settings.service';
import { ThemeService } from '../services/theme.service';
import { UserRightsService } from '../services/user-rights.service';
import { NotificationService, AppNotification } from '../services/notification.service';
import { filter } from 'rxjs';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ConfirmDialogService } from '../services/confirm-dialog.service';
import { DateInputComponent } from '../../shared/date-input/date-input.component';
import { IconComponent } from '../../shared/icon/icon.component';

interface NavLeaf {
  label: string;
  icon: string;
  route: string;
  target: string;
}

interface NavGroup {
  label: string;
  icon: string;
  children: NavLeaf[];
}

interface NavModule {
  label: string;
  icon: string;
  available: boolean;
  children: NavGroup[];
  // Desktop's top-level tab SystemCode (AdminSystemMaster) - a module is only ever shown at all
  // if the logged-in user has this SystemCode granted via the "User_System_Right_Settings" admin
  // screen (see UserRightsController.GetAccessibleSystemModules), same as MainWindow.CheckMenu()
  // hiding whole tabs on desktop. `available` above is a separate, unrelated flag: whether the
  // web app actually has real screens built for this module yet.
  systemCode: number;
}

@Component({
  selector: 'app-erp-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, RouterOutlet, ConfirmDialogComponent, DateInputComponent, IconComponent],
  templateUrl: './erp-shell.component.html',
  styleUrl: './erp-shell.component.scss'
})
export class ErpShellComponent {
  showQuickSettings = false;
  isFullScreen = false;

  showNotifications = false;
  notifications = signal<AppNotification[]>([]);
  notificationsLoading = signal(false);
  private notificationPollHandle: ReturnType<typeof setInterval> | null = null;

  private readonly collapsedStorageKey = 'stimes-erp-sidebar-collapsed';
  sidebarCollapsed = signal(this.readCollapsedState());

  // Which modules/groups are expanded in the accordion tree - keyed by label (module) or
  // "Module::Group" (group), multiple branches can be open at once, same as the reference design.
  private expandedModules = signal(new Set<string>());
  private expandedGroups = signal(new Set<string>());

  // Every module/group/form the web app knows about, in the same Module -> Basic/Activity/Report
  // -> form shape the desktop app itself uses (AdminModuleInfo). A group with no children yet is
  // rendered as a disabled "staged" row instead of an expandable one, exactly like the old
  // hover-flyout version did.
  modules: NavModule[] = [
    {
      // Appearance used to live here (General > Basic) but moved to its own always-visible link
      // under OVERVIEW - it's a personal device preference, not a business module, so it
      // shouldn't need the "General" System Admin right just to use it. Nothing else of General
      // is built yet, so this goes back to unavailable like the other not-yet-built modules.
      label: 'General', icon: 'general', available: false, systemCode: 7,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [] },
        { label: 'Report', icon: 'report', children: [] }
      ]
    },
    {
      label: 'System Admin', icon: 'system-admin', available: true, systemCode: 6,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [
          { label: 'Notification Settings', icon: 'notification', route: '/notification-settings', target: 'notification-settings' }
        ] },
        { label: 'Report', icon: 'report', children: [
          { label: 'Audit Log', icon: 'report', route: '/audit-log', target: 'audit-log' }
        ] }
      ]
    },
    {
      label: 'Payroll', icon: 'payroll', available: true, systemCode: 1,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [
          { label: 'Labour Attendance', icon: 'labour-attendance', route: '/labour-attendance', target: 'labour-attendance' },
          { label: 'Staff Attendance', icon: 'staff-attendance', route: '/staff-attendance', target: 'staff-attendance' },
          { label: 'Leave Application', icon: 'leave', route: '/leave-application', target: 'leave-application' },
          { label: 'DSR Time Sheet', icon: 'dsr-timesheet', route: '/dsr-time-sheet', target: 'dsr-time-sheet' }
        ] },
        { label: 'Report', icon: 'report', children: [
          { label: 'Attendance Report', icon: 'report', route: '/labour-attendance/report', target: 'labour-attendance-report' }
        ] }
      ]
    },
    {
      label: 'Estimation', icon: 'estimation', available: false, systemCode: 10,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [] },
        { label: 'Report', icon: 'report', children: [] }
      ]
    },
    {
      label: 'Operations', icon: 'operations', available: true, systemCode: 8,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [
          { label: 'Daily Site', icon: 'daily-site', route: '/daily-site', target: 'daily-site' },
          { label: 'Manpower Schedule', icon: 'manpower-schedule', route: '/manpower-schedule', target: 'manpower-schedule' }
        ] },
        { label: 'Report', icon: 'report', children: [] }
      ]
    },
    {
      label: 'Fleet', icon: 'fleet', available: true, systemCode: 9,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [
          { label: 'Vehicle Service/Repair', icon: 'service-repair', route: '/vehicle-service-repair', target: 'vehicle-service-repair' },
          { label: 'Trip Sheet', icon: 'trip-sheet', route: '/trip-sheet', target: 'trip-sheet' },
          { label: 'Accident Reporting', icon: 'accident', route: '/accident-report', target: 'accident-report' },
          { label: 'Vehicle Handover', icon: 'vehicle-handover', route: '/vehicle-handover', target: 'vehicle-handover' }
        ] },
        { label: 'Report', icon: 'report', children: [
          { label: 'Trip Sheet Report', icon: 'report', route: '/trip-sheet/gps-report', target: 'trip-sheet-gps-report' }
        ] }
      ]
    },
    {
      label: 'Sales', icon: 'sales', available: false, systemCode: 2,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [] },
        { label: 'Report', icon: 'report', children: [] }
      ]
    },
    {
      label: 'Purchase', icon: 'purchase', available: true, systemCode: 4,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [
          { label: 'Indent', icon: 'indent', route: '/store-indent', target: 'store-indent' },
          { label: 'Resource Return', icon: 'resource-return', route: '/resource-return', target: 'resource-return' }
        ] },
        { label: 'Report', icon: 'report', children: [
          { label: 'Material Expiry Report', icon: 'report', route: '/material-expiry-report', target: 'material-expiry-report' },
          { label: 'Resource Report', icon: 'report', route: '/resource-report', target: 'resource-report' }
        ] }
      ]
    },
    {
      label: 'Inventory', icon: 'inventory', available: false, systemCode: 3,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [] },
        { label: 'Report', icon: 'report', children: [] }
      ]
    },
    {
      // SystemCode 5 = the desktop's own real "ACCOUNTS" system (AdminSystemMaster) - this web
      // module's forms were migrated onto it from a short-lived separate "WEB ACCOUNTS" (12),
      // which has since been deleted, so this menu lives under the same system the desktop app
      // itself uses.
      label: 'Accounts', icon: 'accounts', available: true, systemCode: 5,
      children: [
        { label: 'Basic', icon: 'basic', children: [
          { label: 'Account Head Master', icon: 'account-head', route: '/accounts/account-head', target: 'account-head' },
          { label: 'Cost Center Master', icon: 'cost-center', route: '/accounts/cost-center', target: 'cost-center' }
        ] },
        { label: 'Activity', icon: 'activity', children: [
          { label: 'Sales Invoice', icon: 'sales-invoice', route: '/accounts/sales-invoice', target: 'sales-invoice' },
          { label: 'Purchase Invoice', icon: 'purchase-invoice', route: '/accounts/purchase-invoice', target: 'purchase-invoice' },
          { label: 'Payment', icon: 'payment', route: '/accounts/payment', target: 'payment' },
          { label: 'Receipt', icon: 'receipt', route: '/accounts/receipt', target: 'receipt' },
          { label: 'Contra', icon: 'contra', route: '/accounts/contra', target: 'contra' },
          { label: 'Journal Entry', icon: 'journal', route: '/accounts/voucher', target: 'voucher' },
          { label: 'Petty Cash', icon: 'petty-cash', route: '/accounts/petty-cash', target: 'petty-cash' },
          { label: 'Employee Payments', icon: 'employee-payment', route: '/accounts/employee-payment', target: 'employee-payment' },
          { label: 'Petty Cash Payments', icon: 'petty-cash', route: '/accounts/petty-cash-payment', target: 'petty-cash-payment' }
        ] },
        { label: 'Report', icon: 'report', children: [
          { label: 'Ledger', icon: 'ledger', route: '/accounts/ledger', target: 'ledger' },
          { label: 'Trial Balance', icon: 'trial-balance', route: '/accounts/trial-balance', target: 'trial-balance' },
          { label: 'Balance Sheet', icon: 'balance-sheet', route: '/accounts/balance-sheet', target: 'balance-sheet' },
          { label: 'Profit & Loss', icon: 'profit-loss', route: '/accounts/profit-loss', target: 'profit-loss' }
        ] }
      ]
    },
    {
      label: 'Marketing', icon: 'marketing', available: false, systemCode: 11,
      children: [
        { label: 'Basic', icon: 'basic', children: [] },
        { label: 'Activity', icon: 'activity', children: [] },
        { label: 'Report', icon: 'report', children: [] }
      ]
    }
  ];

  // Which of the SystemCodes above the logged-in user is actually allowed to see at all -
  // fetched once at startup. A module is rendered only when its systemCode is in this set,
  // same as desktop's MainWindow.CheckMenu() collapsing whole tabs. Empty until the request
  // resolves, so nothing shows for a brief instant rather than everything flashing then hiding.
  accessibleSystemCodes = new Set<number>();

  constructor(
    public auth: AuthService,
    public settings: SettingsService,
    // Never referenced below - injecting it here is what actually matters. ThemeService is
    // `providedIn: 'root'`, but Angular only constructs a root service the first time something
    // injects it, and nothing else in the app did anymore once the Appearance toggle moved out of
    // Quick Settings. That left every route except the Appearance settings page itself never
    // instantiating ThemeService at all, so its effect() (which sets data-theme and every
    // --accent/--radius-*/--app-zoom override from localStorage) never ran there - forms opened in
    // their own tab (Staff Attendance, DSR Time Sheet, ...) stayed on plain default light/orange
    // regardless of what was picked on the Appearance page. Since ErpShellComponent wraps every
    // route, injecting it here guarantees it runs once per tab, no matter which page loads first.
    private theme: ThemeService,
    private router: Router,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService,
    public notificationService: NotificationService
  ) {
    this.userRightsService.getAccessibleSystemModules().subscribe({
      next: codes => this.accessibleSystemCodes = new Set(codes ?? []),
      error: () => { /* stay empty - no modules shown rather than showing everything on failure */ }
    });

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(event => {
      const url = (event as NavigationEnd).urlAfterRedirects;
      this.isFullScreen = url.startsWith('/daily-site') || url.startsWith('/store-indent') || url.startsWith('/vehicle-service-repair') || url.startsWith('/trip-sheet') || url.startsWith('/labour-attendance') || url.startsWith('/staff-attendance') || url.startsWith('/leave-application') || url.startsWith('/resource-return') || url.startsWith('/manpower-schedule');
    });
    this.settings.init();

    // ErpShellComponent wraps every route and lives for the app's whole session, so a plain
    // setInterval (not cleaned up) is fine here - same lifetime reasoning as ThemeService above.
    this.notificationService.refreshUnreadCount();
    this.notificationPollHandle = setInterval(() => this.notificationService.refreshUnreadCount(), 60000);
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
    this.showQuickSettings = false;
    if (this.showNotifications) this.loadNotifications();
  }

  private loadNotifications(): void {
    this.notificationsLoading.set(true);
    this.notificationService.getMine().subscribe({
      next: rows => { this.notifications.set(rows ?? []); this.notificationsLoading.set(false); },
      error: () => this.notificationsLoading.set(false)
    });
  }

  openNotification(n: AppNotification): void {
    if (!n.IsRead) {
      this.notificationService.markRead(n.Code).subscribe({
        next: () => {
          this.notifications.update(list => list.map(x => x.Code === n.Code ? { ...x, IsRead: true } : x));
          this.notificationService.refreshUnreadCount();
        },
        error: () => {}
      });
    }
  }

  markAllNotificationsRead(): void {
    this.notificationService.markAllRead().subscribe({
      next: () => {
        this.notifications.update(list => list.map(x => ({ ...x, IsRead: true })));
        this.notificationService.refreshUnreadCount();
      },
      error: () => {}
    });
  }

  // Matches MainWindow.xaml.cs's GetSettings()/SaveSettings(): HeaderGrid.Background switches
  // per BranchCode, so the top bar visibly signals which branch's data you're working in.
  branchColor(): string {
    switch (this.settings.branchCode()) {
      case 1: return '#FFCDD2';  // Light Red
      case 2: return '#BBDEFB';  // Light Blue
      case 3: return '#C8E6C9';  // Light Green
      case 4: return '#B2EBF2';  // Light Cyan/Teal
      case 6: return '#4CAF50';  // Green
      default: return '#FFFFFF'; // Default White
    }
  }

  onCompanyChange(value: string): void {
    this.settings.selectCompany(Number(value));
  }

  onBranchChange(value: string): void {
    this.settings.selectBranch(Number(value));
  }

  onPeriodChange(value: string): void {
    this.settings.selectPeriod(Number(value));
  }

  onProcessingDateChange(value: string): void {
    if (value) this.settings.selectProcessingDate(value);
  }

  saveSettings(): void {
    this.settings.save();
  }

  rowValue(record: any, key: string): any {
    const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
    return record?.[key] ?? record?.[camelKey];
  }

  toggleSidebarCollapsed(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    try { localStorage.setItem(this.collapsedStorageKey, next ? '1' : '0'); } catch { /* ignore */ }
  }

  private readCollapsedState(): boolean {
    try {
      const stored = localStorage.getItem(this.collapsedStorageKey);
      if (stored !== null) return stored === '1';
    } catch { /* ignore */ }
    // No explicit preference yet - default collapsed on a phone-width first visit, since the
    // expanded sidebar renders as a full-height overlay drawer there (see the component's
    // narrow-screen styles) and shouldn't cover the whole screen the moment the app loads.
    return typeof window !== 'undefined' && window.innerWidth <= 700;
  }

  isModuleExpanded(module: NavModule): boolean {
    return this.expandedModules().has(module.label);
  }

  toggleModule(module: NavModule): void {
    if (!module.available) return;
    // Collapsed sidebar: clicking a module icon expands the whole rail back out and opens
    // that module, rather than trying to show a tree inside a 60px-wide strip.
    if (this.sidebarCollapsed()) this.sidebarCollapsed.set(false);

    const next = new Set(this.expandedModules());
    if (next.has(module.label)) next.delete(module.label); else next.add(module.label);
    this.expandedModules.set(next);
  }

  isGroupExpanded(module: NavModule, group: NavGroup): boolean {
    return this.expandedGroups().has(`${module.label}::${group.label}`);
  }

  toggleGroup(module: NavModule, group: NavGroup): void {
    if (group.children.length === 0) return;
    const key = `${module.label}::${group.label}`;
    const next = new Set(this.expandedGroups());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.expandedGroups.set(next);
  }

  async logout(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm('Are you sure you want to logout?');
    if (confirmed) this.auth.logout();
  }
}
