import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.Report_BalanceSheet';

interface GroupNode {
  key: string;
  label: string;
  rows: any[];
  total: number;
}

@Component({
  selector: 'app-balance-sheet-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './balance-sheet-report.component.html',
  styleUrl: './balance-sheet-report.component.scss'
})
export class BalanceSheetReportComponent implements OnInit {
  asOfDate = signal(this.today());
  rows = signal<any[]>([]);
  netProfitForYear = signal(0);
  currencySymbol = signal('');
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  private groupByNature(natures: string[]): GroupNode[] {
    const filtered = this.rows().filter(r => natures.includes(this.toText(this.read(r, 'Nature'))));
    const map = new Map<string, any[]>();
    for (const row of filtered) {
      const key = this.toText(this.read(row, 'GroupName')) || '(ungrouped)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries()).map(([key, groupRows]) => ({
      key, label: key, rows: groupRows,
      total: this.round2(groupRows.reduce((sum, r) => sum + Math.abs(this.toNumber(this.read(r, 'Balance'))), 0))
    }));
  }

  // Assets carry a Dr (positive) balance by convention; Liabilities/Equity carry a Cr (negative)
  // balance - shown here as its absolute value on the "Liabilities & Equity" side.
  assetGroups = computed<GroupNode[]>(() => this.groupByNature(['Asset']));
  liabilityGroups = computed<GroupNode[]>(() => this.groupByNature(['Liability', 'Equity']));

  totalAssets = computed(() => this.round2(this.assetGroups().reduce((sum, g) => sum + g.total, 0)));
  totalLiabilities = computed(() => this.round2(this.liabilityGroups().reduce((sum, g) => sum + g.total, 0)) + this.netProfitForYear());

  isBalanced = computed(() => Math.abs(this.totalAssets() - this.totalLiabilities()) < 0.01);

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
    const branchCode = this.settings.branchCode();
    const asOf = this.asOfDate();
    const yearStart = `${asOf.substring(0, 4)}-01-01`;

    this.service.getBalanceSheet(branchCode, asOf).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load the Balance Sheet.'); this.loading.set(false); }
    });

    // Current year's Net Profit/Loss folds into the Liabilities & Equity side, same as standard
    // accounting practice - otherwise a Balance Sheet on its own can never actually balance,
    // since Income/Expense movements aren't Assets/Liabilities accounts at all.
    this.service.getProfitAndLoss(branchCode, yearStart, asOf).subscribe({
      next: rows => {
        const income = (rows ?? []).filter(r => this.read(r, 'Nature') === 'Income').reduce((sum, r) => sum + this.toNumber(this.read(r, 'NetAmount')), 0);
        const expense = (rows ?? []).filter(r => this.read(r, 'Nature') === 'Expense').reduce((sum, r) => sum + this.toNumber(this.read(r, 'NetAmount')), 0);
        this.netProfitForYear.set(this.round2(income + expense));
      },
      error: () => {}
    });
  }

  back(): void {
    this.router.navigate(['/accounts/account-head']);
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
