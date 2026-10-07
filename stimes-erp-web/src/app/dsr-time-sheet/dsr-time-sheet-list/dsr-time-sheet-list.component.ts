import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DsrTimeSheetService } from '../services/dsr-time-sheet.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Payroll_System.DSRDailyTimeSheet';

@Component({
  selector: 'app-dsr-time-sheet-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dsr-time-sheet-list.component.html',
  styleUrl: './dsr-time-sheet-list.component.scss'
})
export class DsrTimeSheetListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);
  searchText = signal('');
  // 0 = all months, same "Month" dropdown convention the desktop's side grid uses - defaults to
  // the current calendar month instead, so the list opens already scoped to "this month" rather
  // than every DSR ever created.
  monthCode = signal(new Date().getMonth() + 1);
  months = [
    { code: 0, name: 'All Months' }, { code: 1, name: 'January' }, { code: 2, name: 'February' },
    { code: 3, name: 'March' }, { code: 4, name: 'April' }, { code: 5, name: 'May' }, { code: 6, name: 'June' },
    { code: 7, name: 'July' }, { code: 8, name: 'August' }, { code: 9, name: 'September' },
    { code: 10, name: 'October' }, { code: 11, name: 'November' }, { code: 12, name: 'December' }
  ];

  filteredRows = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(this.read(row, 'DSRNumber') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'BranchName') ?? '').toLowerCase().includes(term));
  });

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  // Multi-select is purely for printing several DSRs at once - checked rows carry over to
  // /dsr-time-sheet/print-multi, which renders each one as its own report section.
  selectedIds = signal<Set<number>>(new Set());
  allSelected = computed(() => {
    const rows = this.filteredRows();
    return rows.length > 0 && rows.every(r => this.selectedIds().has(this.toNumber(this.read(r, 'DSRCode'))));
  });

  constructor(
    private service: DsrTimeSheetService,
    private settings: SettingsService,
    private router: Router,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {
    effect(() => {
      // periodId() also starts at 0 until settings finish loading, same race as branchCode().
      if (this.settings.periodId()) this.refresh();
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

  refresh(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getList(this.settings.periodId(), this.monthCode()).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.selectedIds.set(new Set()); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load DSR Time Sheets.'); this.loading.set(false); }
    });
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/dsr-time-sheet/0']);
  }

  open(row: any): void {
    this.router.navigate(['/dsr-time-sheet', this.read(row, 'DSRCode')]);
  }

  toggleSelected(row: any, event: Event): void {
    event.stopPropagation();
    const code = this.toNumber(this.read(row, 'DSRCode'));
    const next = new Set(this.selectedIds());
    if (next.has(code)) next.delete(code); else next.add(code);
    this.selectedIds.set(next);
  }

  isSelected(row: any): boolean {
    return this.selectedIds().has(this.toNumber(this.read(row, 'DSRCode')));
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
      return;
    }
    this.selectedIds.set(new Set(this.filteredRows().map(r => this.toNumber(this.read(r, 'DSRCode')))));
  }

  // A real <a routerLink target="..."> link (bound to this in the template), not window.open() -
  // matches every other "open in its own tab" link in this app, and unlike a JS-triggered
  // window.open(), it's never treated as a popup by the browser.
  printSelectedQueryParams = computed(() => ({ ids: Array.from(this.selectedIds()).join(',') }));

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();
    const code = this.toNumber(this.read(row, 'DSRCode'));
    if (!code) return;

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete this DSR Time Sheet ?'))) return;

    this.deleting.set(true);
    this.service.delete(code).subscribe({
      next: (res: any) => {
        this.deleting.set(false);
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.refresh();
      },
      error: () => { this.deleting.set(false); this.errorMessage.set('Could not delete the record.'); }
    });
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
