import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private base = `${environment.apiBaseUrl}/settings`;

  companies = signal<any[]>([]);
  branches = signal<any[]>([]);
  financialPeriods = signal<any[]>([]);

  companyCode = signal(0);
  branchCode = signal(0);
  periodId = signal(0);

  loaded = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  private settingsCode = 0;

  companyName = computed(() => this.label(this.companies(), this.companyCode(), 'CompanyCode', 'CompanyName'));
  branchName = computed(() => this.label(this.branches(), this.branchCode(), 'BranchCode', 'BranchName'));

  selectedPeriod = computed(() =>
    this.financialPeriods().find(row => Number(this.read(row, 'PeriodId')) === this.periodId()));

  processingDate = computed(() => this.computeProcessingDate(this.selectedPeriod()));

  constructor(private http: HttpClient) {}

  init(): void {
    if (this.loaded()) return;

    this.http.get<any[]>(`${this.base}/companies`).subscribe({
      next: companies => {
        this.companies.set(companies ?? []);
        this.loadPeriodsThenSettings();
      },
      error: () => this.errorMessage.set('Could not load company list.')
    });
  }

  private loadPeriodsThenSettings(): void {
    this.http.get<any[]>(`${this.base}/financial-periods`).subscribe({
      next: periods => {
        this.financialPeriods.set(periods ?? []);
        this.loadMySettings();
      },
      error: () => this.errorMessage.set('Could not load financial periods.')
    });
  }

  private loadMySettings(): void {
    this.http.get<any[]>(`${this.base}/my-settings`).subscribe({
      next: rows => {
        const saved = rows?.[0];
        const companyCode = saved
          ? Number(this.read(saved, 'CompanyCode'))
          : Number(this.read(this.companies()[0], 'CompanyCode') ?? 0);

        this.settingsCode = saved ? Number(this.read(saved, 'SettingsCode', 'SettingCode') ?? 0) : 0;
        this.companyCode.set(companyCode);

        const savedBranchCode = saved ? Number(this.read(saved, 'BranchCode')) : null;
        const savedPeriodId = saved ? Number(this.read(saved, 'PeriodId')) : this.defaultPeriodId();
        this.periodId.set(savedPeriodId);

        this.loadBranches(companyCode, savedBranchCode);
      },
      error: () => this.errorMessage.set('Could not load user settings.')
    });
  }

  private loadBranches(companyCode: number, preferredBranchCode: number | null): void {
    this.http.get<any[]>(`${this.base}/branches`, { params: { companyCode } }).subscribe({
      next: branches => {
        this.branches.set(branches ?? []);
        const fallback = Number(this.read(branches?.[0], 'BranchCode') ?? 0);
        this.branchCode.set(preferredBranchCode ?? fallback);
        this.loaded.set(true);
      },
      error: () => { this.errorMessage.set('Could not load branch list.'); this.loaded.set(true); }
    });
  }

  selectCompany(companyCode: number): void {
    this.companyCode.set(companyCode);
    this.loadBranches(companyCode, null);
  }

  selectBranch(branchCode: number): void {
    this.branchCode.set(branchCode);
  }

  selectPeriod(periodId: number): void {
    this.periodId.set(periodId);
  }

  save(): void {
    this.saving.set(true);
    this.errorMessage.set(null);

    this.http.post(`${this.base}/my-settings`, {
      settingsCode: this.settingsCode,
      companyCode: this.companyCode(),
      branchCode: this.branchCode(),
      periodId: this.periodId()
    }).subscribe({
      next: () => this.saving.set(false),
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'Could not save settings.');
      }
    });
  }

  private defaultPeriodId(): number {
    const today = new Date();
    const current = this.financialPeriods().find(row => {
      const from = this.parseDate(this.read(row, 'FromDate'));
      const to = this.parseDate(this.read(row, 'ToDate'));
      return !!from && !!to && today >= from && today <= to;
    });
    return Number(this.read(current ?? this.financialPeriods()[0], 'PeriodId') ?? 0);
  }

  private computeProcessingDate(period: any): Date | null {
    if (!period) return null;

    const today = new Date();
    const from = this.parseDate(this.read(period, 'FromDate'));
    const to = this.parseDate(this.read(period, 'ToDate'));
    if (from && to && today >= from && today <= to) return today;

    const stored = this.parseDate(this.read(period, 'ProcessingDate'));
    // Always fall back to something displayable - never hand an Invalid Date to the date pipe,
    // which throws and silently blanks the field instead of showing an error.
    return stored ?? to ?? today;
  }

  private parseDate(value: unknown): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private label(rows: any[], code: number, codeKey: string, nameKey: string): string {
    const row = rows.find(item => Number(this.read(item, codeKey)) === code);
    return row ? String(this.read(row, nameKey) ?? '') : '';
  }

  private read(record: any, ...keys: string[]): any {
    if (!record) return undefined;
    for (const key of keys) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (record[key] !== undefined) return record[key];
      if (record[camelKey] !== undefined) return record[camelKey];
    }
    return undefined;
  }
}
