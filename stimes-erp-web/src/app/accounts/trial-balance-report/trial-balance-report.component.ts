import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.Report_TrialBalance';

interface GroupNode {
  key: string;
  label: string;
  rows: any[];
}

@Component({
  selector: 'app-trial-balance-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trial-balance-report.component.html',
  styleUrl: './trial-balance-report.component.scss'
})
export class TrialBalanceReportComponent implements OnInit {
  asOfDate = signal(this.today());
  rows = signal<any[]>([]);
  currencySymbol = signal('');
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  groups = computed<GroupNode[]>(() => {
    const map = new Map<string, any[]>();
    for (const row of this.rows()) {
      const key = this.toText(this.read(row, 'GroupName')) || '(ungrouped)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries()).map(([key, groupRows]) => ({ key, label: key, rows: groupRows }));
  });

  totalDebit = computed(() => this.round2(this.rows().reduce((sum, r) => sum + Math.max(0, this.toNumber(this.read(r, 'Balance'))), 0)));
  totalCredit = computed(() => this.round2(this.rows().reduce((sum, r) => sum + Math.max(0, -this.toNumber(this.read(r, 'Balance'))), 0)));

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private service: AccountService,
    private settings: SettingsService,
    private router: Router,
    private userRightsService: UserRightsService
  ) {
    // branchCode() starts at 0 until SettingsService's async load chain finishes (see
    // account-head-list.component.ts) - loading reactively instead of once in ngOnInit means the
    // report still populates once the real branch is known, and refreshes again on branch switch.
    effect(() => {
      const branchCode = this.settings.branchCode();
      if (!branchCode) return;
      this.load();
      this.service.getCurrency(branchCode).subscribe({
        next: res => this.currencySymbol.set(this.read(res, 'CurrShortName') ?? ''),
        error: () => {}
      });
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.loadRights();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getTrialBalance(this.settings.branchCode(), this.asOfDate()).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load the Trial Balance.'); this.loading.set(false); }
    });
  }

  back(): void {
    this.router.navigate(['/accounts/account-head']);
  }

  debitAmount(row: any): number {
    return Math.max(0, this.toNumber(this.read(row, 'Balance')));
  }

  creditAmount(row: any): number {
    return Math.max(0, -this.toNumber(this.read(row, 'Balance')));
  }

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  toText(value: unknown): string {
    return value == null ? '' : String(value);
  }

  read(record: any, ...keys: string[]): any {
    if (!record) return undefined;
    for (const key of keys) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (record[key] !== undefined) return record[key];
      if (record[camelKey] !== undefined) return record[camelKey];
    }
    return undefined;
  }
}
