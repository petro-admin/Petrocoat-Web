import { Component } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { SettingsService } from '../services/settings.service';
import { filter } from 'rxjs';
import { ConfirmDialogComponent } from './confirm-dialog.component';

interface ModuleItem {
  label: string;
  icon: string;
  route?: string;
  available: boolean;
  details: string[];
}

@Component({
  selector: 'app-erp-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterOutlet, ConfirmDialogComponent],
  templateUrl: './erp-shell.component.html',
  styleUrl: './erp-shell.component.scss'
})
export class ErpShellComponent {
  showQuickSettings = false;
  showModules = false;
  activeModule = '';
  isFullScreen = false;
  modules: ModuleItem[] = [
    { label: 'General', icon: 'G', available: false, details: ['Basic', 'Activity', 'Report'] },
    { label: 'System Admin', icon: 'A', available: false, details: ['Basic', 'Activity', 'Report'] },
    { label: 'Payroll', icon: 'P', available: false, details: ['Basic', 'Activity', 'Report'] },
    { label: 'Estimation', icon: 'E', available: false, details: ['Basic', 'Activity', 'Report'] },
    { label: 'Operations', icon: 'O', available: true, details: ['Basic', 'Activity', 'Report'] },
    { label: 'Fleet', icon: 'F', available: false, details: ['Basic', 'Activity', 'Report'] },
    { label: 'Sales', icon: 'S', available: false, details: ['Basic', 'Activity', 'Report'] },
    { label: 'Purchase', icon: 'B', available: true, details: ['Basic', 'Activity', 'Report'] },
    { label: 'Inventory', icon: 'I', available: false, details: ['Basic', 'Activity', 'Report'] },
    { label: 'Accounts', icon: 'C', available: false, details: ['Basic', 'Activity', 'Report'] },
    { label: 'Marketing', icon: 'M', available: false, details: ['Basic', 'Activity', 'Report'] }
  ];

  private closeModulesTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(public auth: AuthService, public settings: SettingsService, private router: Router) {
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(event => {
      const url = (event as NavigationEnd).urlAfterRedirects;
      this.isFullScreen = url.startsWith('/daily-site') || url.startsWith('/store-indent');

      // Picking a form from the flyout navigates - close it so the newly opened form is fully visible.
      this.showModules = false;
      this.activeModule = '';
    });
    this.settings.init();
  }

  goHome(): void {
    this.router.navigate(['/']);
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

  saveSettings(): void {
    this.settings.save();
  }

  rowValue(record: any, key: string): any {
    const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
    return record?.[key] ?? record?.[camelKey];
  }

  selectModule(label: string): void {
    if (this.modules.some(module => module.label === label && module.available)) this.activeModule = label;
  }

  selectActivity(): void {
    this.activeModule = 'Operations Activity';
  }

  selectPurchaseActivity(): void {
    this.activeModule = 'Purchase Activity';
  }

  toggleModules(): void {
    this.cancelCloseModules();
    this.showModules = !this.showModules;
    if (!this.showModules) this.activeModule = '';
  }

  // Hovering the logo opens the flyout as an overlay on top of whatever form is
  // currently open, matching the desktop app - it never navigates away on its own.
  openModules(): void {
    this.cancelCloseModules();
    this.showModules = true;
  }

  scheduleCloseModules(): void {
    this.cancelCloseModules();
    this.closeModulesTimer = setTimeout(() => {
      this.showModules = false;
      this.activeModule = '';
    }, 200);
  }

  cancelCloseModules(): void {
    if (this.closeModulesTimer) {
      clearTimeout(this.closeModulesTimer);
      this.closeModulesTimer = null;
    }
  }

  get activeModuleDetails(): string[] {
    if (this.activeModule === 'Operations Activity') return ['Daily Site'];
    if (this.activeModule === 'Purchase Activity') return ['Store Indent'];
    return this.modules.find(module => module.label === this.activeModule)?.details ?? [];
  }

  logout(): void {
    this.auth.logout();
  }
}
