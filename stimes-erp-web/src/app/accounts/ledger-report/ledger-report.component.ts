import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { MultiSelectComponent } from '../../shared/multi-select/multi-select.component';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.Report_Ledger';

interface LedgerBlock {
  accountHeadCode: number;
  headName: string;
  openingBalance: number;
  rowsWithBalance: { row: any; balance: number }[];
  closingBalance: number;
}

@Component({
  selector: 'app-ledger-report',
  standalone: true,
  imports: [CommonModule, FormsModule, MultiSelectComponent],
  templateUrl: './ledger-report.component.html',
  styleUrl: './ledger-report.component.scss'
})
export class LedgerReportComponent implements OnInit {
  heads = signal<any[]>([]);
  headOptions = computed(() => this.heads().map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') })));
  currencySymbol = signal('');
  accountHeadCodes = signal<number[]>([]);
  fromDate = signal(this.firstDayOfMonth());
  toDate = signal(this.today());

  ledgerBlocks = signal<LedgerBlock[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private service: AccountService,
    private settings: SettingsService,
    private router: Router,
    private userRightsService: UserRightsService
  ) {
    // branchCode() starts at 0 until SettingsService's async load chain finishes (see
    // account-head-list.component.ts) - loading the Account Head dropdown/currency reactively
    // instead of once in ngOnInit means they still populate once the real branch is known, and
    // refresh again on branch switch.
    effect(() => {
      const branchCode = this.settings.branchCode();
      if (!branchCode) return;
      this.service.getHeads(branchCode).subscribe({ next: rows => this.heads.set(rows ?? []), error: () => {} });
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
    const codes = this.accountHeadCodes();
    if (codes.length === 0) { this.errorMessage.set('Please select at least one Account Head.'); return; }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getLedger(codes, this.fromDate(), this.toDate()).subscribe({
      next: results => {
        this.ledgerBlocks.set((results ?? []).map(r => this.buildBlock(r)));
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load the Ledger.'); this.loading.set(false); }
    });
  }

  // Each selected ledger keeps its own opening/running/closing balance - there's no single
  // combined balance across different ledgers, same as Tally's own multi-ledger display.
  private buildBlock(res: any): LedgerBlock {
    const openingBalance = this.toNumber(this.read(res, 'openingBalance'));
    let running = openingBalance;
    const rowsWithBalance = (this.read(res, 'lines') ?? []).map((row: any) => {
      running += this.toNumber(this.read(row, 'DebitAmount')) - this.toNumber(this.read(row, 'CreditAmount'));
      return { row, balance: this.round2(running) };
    });
    return {
      accountHeadCode: this.toNumber(this.read(res, 'accountHeadCode')),
      headName: this.read(res, 'headName') ?? '',
      openingBalance,
      rowsWithBalance,
      closingBalance: rowsWithBalance.length > 0 ? rowsWithBalance[rowsWithBalance.length - 1].balance : this.round2(openingBalance)
    };
  }

  back(): void {
    this.router.navigate(['/accounts/account-head']);
  }

  drCr(value: number): string {
    return value >= 0 ? 'Dr' : 'Cr';
  }

  private firstDayOfMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
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
