import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ResourceReportService, ResourceReportType } from '../services/resource-report.service';
import { SettingsService } from '../../core/services/settings.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { DateInputComponent } from '../../shared/date-input/date-input.component';
import { FilterSelectComponent } from '../../shared/filter-select/filter-select.component';
import { MultiSelectComponent } from '../../shared/multi-select/multi-select.component';
import { exportRowsToExcel } from '../../shared/excel-export';

// Matches the FormClassName convention for other web-only reports (Report_BalanceSheet,
// Report_Ledger, ...) - no desktop equivalent exists for this screen, so this key is this app's
// own invention, placed under Purchase since the data comes from Store Indent.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Purchase.Report_ResourceRequestVsIssue';

@Component({
  selector: 'app-resource-report-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DateInputComponent, FilterSelectComponent, MultiSelectComponent],
  templateUrl: './resource-report-list.component.html',
  styleUrl: './resource-report-list.component.scss'
})
export class ResourceReportListComponent implements OnInit {
  fromDate = '';
  toDate = '';
  soCode: number | null = null;
  // Empty = every branch - matches desktop's own Resource Report screens, which use a multi-select
  // Branch box rather than being locked to the single currently-active Quick Settings branch.
  branchCodes: number[] = [];
  type = signal<ResourceReportType | 'all'>('material');
  itemCode: number | null = null;

  salesOrders = signal<any[]>([]);
  materials = signal<any[]>([]);
  consumables = signal<any[]>([]);
  taeItems = signal<any[]>([]);

  rows = signal<any[]>([]);
  searched = signal(false);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  // Item picker is type-aware: whichever checkbox (Material/Consumable/Tools and Equipment) is
  // active decides which item list "Details" filters against - matches the desktop grid's own
  // Type-driven item lookup convention (Store Indent's General grid does the same thing).
  currentItemOptions = computed(() => {
    switch (this.type()) {
      case 'material': return this.materials();
      case 'consumable': return this.consumables();
      case 'tae': return this.taeItems();
      default: return [];
    }
  });

  collapsed = signal<Set<string>>(new Set());

  jobGroups = computed(() => {
    const groups: { key: string; label: string; rows: any[] }[] = [];
    const indexByKey = new Map<string, number>();
    for (const row of this.rows()) {
      const key = String(this.read(row, 'SOCode') ?? '(none)');
      if (!indexByKey.has(key)) {
        indexByKey.set(key, groups.length);
        groups.push({ key, label: this.read(row, 'JobNo') ?? '(none)', rows: [] });
      }
      groups[indexByKey.get(key)!].rows.push(row);
    }
    return groups;
  });

  toggle(key: string): void {
    const next = new Set(this.collapsed());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.collapsed.set(next);
  }

  isCollapsed(key: string): boolean {
    return this.collapsed().has(key);
  }

  totals = computed(() => {
    const rows = this.rows();
    return {
      requested: rows.reduce((sum, r) => sum + this.toNumber(this.read(r, 'RequestedQty')), 0),
      issued: rows.reduce((sum, r) => sum + this.toNumber(this.read(r, 'IssuedQty')), 0),
      balance: rows.reduce((sum, r) => sum + this.toNumber(this.read(r, 'BalanceQty')), 0)
    };
  });

  constructor(
    private service: ResourceReportService,
    public settings: SettingsService,
    private userRightsService: UserRightsService
  ) {
    const { from, to } = this.previousWeekRange();
    this.fromDate = from;
    this.toDate = to;
  }

  ngOnInit(): void {
    this.loadRights();
    this.loadLookups();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private loadLookups(): void {
    this.service.getLookups().subscribe({
      next: res => {
        this.salesOrders.set(res.salesOrders ?? []);
        this.materials.set(res.materials ?? []);
        this.consumables.set(res.consumables ?? []);
        this.taeItems.set(res.taeItems ?? []);
      },
      error: () => this.errorMessage.set('Could not load dropdown data.')
    });
  }

  // Previous week, Monday to Sunday - the default range on first load (not the current week).
  private previousWeekRange(): { from: string; to: string } {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
    const diffToThisMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToThisMonday);
    const prevMonday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
    const prevSunday = new Date(prevMonday.getFullYear(), prevMonday.getMonth(), prevMonday.getDate() + 6);
    return { from: this.toIso(prevMonday), to: this.toIso(prevSunday) };
  }

  private toIso(date: Date): string {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
      .join('-');
  }

  setType(type: ResourceReportType | 'all'): void {
    this.type.set(type);
    this.itemCode = null;
  }

  search(): void {
    if (!this.rights().access) return;
    if (!this.fromDate || !this.toDate) {
      this.errorMessage.set('Choose both From Date and To Date.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const soCode = this.soCode ?? 0;
    const itemCode = this.itemCode ?? 0;

    const types: ResourceReportType[] = this.type() === 'all' ? ['material', 'consumable', 'tae'] : [this.type() as ResourceReportType];
    forkJoin(types.map(t => this.service.getReport(t, this.fromDate, this.toDate, soCode, this.branchCodes, itemCode))).subscribe({
      next: results => {
        const combined: any[] = [];
        types.forEach((t, i) => (results[i] ?? []).forEach((row: any) => combined.push({ ...row, Type: this.typeLabel(t) })));
        this.rows.set(combined);
        this.searched.set(true);
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load the report. Check the API connection.'); this.loading.set(false); }
    });
  }

  private typeLabel(type: ResourceReportType): string {
    return type === 'material' ? 'Material' : type === 'consumable' ? 'Consumable' : 'Tools and Equipment';
  }

  // Same pattern as Trip Sheet Report's own Print button - native browser print, with the filter
  // card hidden and the table un-clipped via @media print CSS. Covers PDF too: every browser's
  // print dialog offers "Save as PDF" as a destination, so no separate PDF generation is needed.
  print(): void {
    window.print();
  }

  exporting = signal(false);

  async exportToExcel(): Promise<void> {
    if (this.rows().length === 0) return;
    this.exporting.set(true);
    try {
      const includeType = this.type() === 'all';
      const columns = [
        ...(includeType ? [{ header: 'Type', key: 'type', width: 16 }] : []),
        { header: 'Job No', key: 'jobNo', width: 45 },
        { header: 'Item', key: 'item', width: 45 },
        { header: 'Unit', key: 'unit', width: 12 },
        { header: 'Requested Qty', key: 'requested', width: 16, numFmt: '#,##0.00' },
        { header: 'Issued Qty', key: 'issued', width: 16, numFmt: '#,##0.00' },
        { header: 'Balance Qty', key: 'balance', width: 16, numFmt: '#,##0.00' }
      ];
      const data = this.rows().map(row => ({
        ...(includeType ? { type: this.read(row, 'Type') } : {}),
        jobNo: this.read(row, 'JobNo'),
        item: this.read(row, 'ItemName'),
        unit: this.read(row, 'UnitName'),
        requested: this.toNumber(this.read(row, 'RequestedQty')),
        issued: this.toNumber(this.read(row, 'IssuedQty')),
        balance: this.toNumber(this.read(row, 'BalanceQty'))
      }));
      await exportRowsToExcel(`Resource Report ${this.fromDate}_to_${this.toDate}`, 'Resource Report', columns, data);
    } finally {
      this.exporting.set(false);
    }
  }

  rowValue(row: any, key: string): any {
    return this.read(row, key);
  }

  private read(record: any, key: string): any {
    const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
    return record?.[key] ?? record?.[camelKey];
  }

  private toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
}
