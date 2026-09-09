import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DailySiteService } from '../services/daily-site.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

interface JobDescGroup {
  key: string;      // composite key for collapse state, e.g. "BranchA|DivisionX|JobDescY"
  label: string;
  isGreen: boolean; // matches JobDescGroupHeader_Loaded: green when IsStatus == 1
  rows: any[];
}

interface DivisionGroup {
  key: string;      // composite key, e.g. "BranchA|DivisionX"
  label: string;
  jobDescGroups: JobDescGroup[];
}

interface BranchGroup {
  key: string;      // just the branch name, top level
  label: string;
  divisionGroups: DivisionGroup[];
}

@Component({
  selector: 'app-daily-site-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './daily-site-list.component.html',
  styleUrl: './daily-site-list.component.scss'
})
export class DailySiteListComponent implements OnInit {
  months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];
  years: number[] = [];

  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();

  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);

  collapsed = signal<Set<string>>(new Set());

  // Per-column filter text, mirrors the WPF grid's IsFilterable="True" columns
  // (Doc No, Doc Date, Job No/JobDesc, Project Details/Project, Status/PStatus).
  filters = signal({
    docNo: '',
    docDate: '',
    jobDesc: '',
    project: '',
    status: ''
  });

  // Rows after applying the column filters, before grouping.
  filteredRows = computed<any[]>(() => {
    const f = this.filters();
    return this.rows().filter(row => {
      if (f.docNo && !String(this.read(row, 'DocNo') ?? '').toLowerCase().includes(f.docNo.toLowerCase())) return false;
      if (f.docDate) {
        if (this.toDateFilterValue(this.read(row, 'DocDate')) !== f.docDate) return false;
      }
      if (f.jobDesc && !String(this.read(row, 'JobDesc') ?? '').toLowerCase().includes(f.jobDesc.toLowerCase())) return false;
      if (f.project && !String(this.read(row, 'Project') ?? '').toLowerCase().includes(f.project.toLowerCase())) return false;
      if (f.status && !String(this.read(row, 'PStatus') ?? '').toLowerCase().includes(f.status.toLowerCase())) return false;
      return true;
    });
  });

  branchGroups = computed<BranchGroup[]>(() => this.buildGroups(this.filteredRows()));

  constructor(
    private dailySiteService: DailySiteService,
    private settings: SettingsService,
    private router: Router,
    private confirmDialog: ConfirmDialogService
  ) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 5; y <= currentYear + 1; y++) this.years.push(y);
  }

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.dailySiteService.getList(this.selectedMonth, this.selectedYear).subscribe({
      next: (data) => {
        this.rows.set(data ?? []);
        this.collapseAllGroups();
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load list. Check API connection.'); this.loading.set(false); }
    });
  }

  updateFilter(field: keyof ReturnType<typeof this.filters>, value: string): void {
    this.filters.set({ ...this.filters(), [field]: value });
  }

  clearFilters(): void {
    this.filters.set({ docNo: '', docDate: '', jobDesc: '', project: '', status: '' });
  }

  private toDateFilterValue(value: unknown): string {
    if (!value) return '';

    const text = String(value);
    const isoDate = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (isoDate) return isoDate;

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return '';

    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
      .join('-');
  }

  rowValue(row: any, key: string): any {
    return this.read(row, key);
  }

  private read(record: any, key: string): any {
    const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
    return record?.[key] ?? record?.[camelKey];
  }

  private buildGroups(rows: any[]): BranchGroup[] {
    const branchMap = new Map<string, Map<string, Map<string, any[]>>>();

    for (const row of rows) {
      const branchKey = this.read(row, 'BranchName') ?? '(none)';
      const divisionKey = this.read(row, 'Division') ?? '(none)';
      const jobDescKey = this.read(row, 'JobDesc') ?? '(none)';

      if (!branchMap.has(branchKey)) branchMap.set(branchKey, new Map());
      const divisionMap = branchMap.get(branchKey)!;

      if (!divisionMap.has(divisionKey)) divisionMap.set(divisionKey, new Map());
      const jobDescMap = divisionMap.get(divisionKey)!;

      if (!jobDescMap.has(jobDescKey)) jobDescMap.set(jobDescKey, []);
      jobDescMap.get(jobDescKey)!.push(row);
    }

    const branchGroups: BranchGroup[] = [];
    for (const [branchKey, divisionMap] of branchMap) {
      const divisionGroups: DivisionGroup[] = [];
      for (const [divisionKey, jobDescMap] of divisionMap) {
        const jobDescGroups: JobDescGroup[] = [];
        for (const [jobDescKey, groupRows] of jobDescMap) {
          const isGreen = groupRows.some(r => Number(this.read(r, 'IsStatus')) === 1);
          jobDescGroups.push({
            key: `${branchKey}|${divisionKey}|${jobDescKey}`,
            label: jobDescKey,
            isGreen,
            rows: groupRows
          });
        }
        divisionGroups.push({
          key: `${branchKey}|${divisionKey}`,
          label: divisionKey,
          jobDescGroups
        });
      }
      branchGroups.push({ key: branchKey, label: branchKey, divisionGroups });
    }
    return branchGroups;
  }

  toggle(key: string): void {
    const next = new Set(this.collapsed());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.collapsed.set(next);
  }

  isCollapsed(key: string): boolean {
    return this.collapsed().has(key);
  }

  private collapseAllGroups(): void {
    const keys = new Set<string>();
    for (const branch of this.branchGroups()) {
      keys.add(branch.key);
      for (const division of branch.divisionGroups) {
        keys.add(division.key);
        for (const jobDesc of division.jobDescGroups) keys.add(jobDesc.key);
      }
    }
    this.collapsed.set(keys);
  }

  // "+ New" navigates in the current tab, same as editing a row - only switching to a different
  // form/module (the flyout menu links) opens a new tab.
  openNew(): void {
    this.router.navigate(['/daily-site', 0]);
  }

  // Editing an existing row navigates in the current tab, same as any normal web link.
  open(row: any): void {
    this.router.navigate(['/daily-site', this.read(row, 'DailySiteCode')]);
  }

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();

    const id = Number(this.read(row, 'DailySiteCode'));
    if (!id) {
      this.errorMessage.set('Choose an item to delete...!');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete the item ?'))) return;

    // Equivalent of StaticClass.BranchCode / StaticClass.PeriodId in the desktop app,
    // sourced from the Quick Settings panel (SettingsService).
    const branchCode = this.settings.branchCode();
    const periodId = this.settings.periodId();

    this.deleting.set(true);
    this.errorMessage.set(null);
    this.dailySiteService.delete(id, branchCode, periodId).subscribe({
      next: (res: any) => {
        this.deleting.set(false);
        // Matches the desktop app's DeleteButton_Click -> SaveDetails(): MessageBox.Show(result),
        // where result is whatever usp_ManageDailySite returns for the Mode 2 (delete) run.
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.refresh();
      },
      error: () => { this.deleting.set(false); this.errorMessage.set('Could not delete the item. Check the API connection.'); }
    });
  }
}