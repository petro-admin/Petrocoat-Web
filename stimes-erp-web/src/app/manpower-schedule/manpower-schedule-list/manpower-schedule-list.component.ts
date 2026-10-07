import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ManpowerScheduleService } from '../services/manpower-schedule.service';
import { SettingsService } from '../../core/services/settings.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { DateInputComponent } from '../../shared/date-input/date-input.component';

// Matches this.GetType().ToString() in the desktop app's ManpowerSchedule.xaml.cs - the key
// usp_GetUserRightSecurity / usp_admin_GetApprovalSettingsHDR_By_FormClassName look up by.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Production.ManpowerSchedule';

interface MonthGroup {
  key: string;
  label: string;
  rows: any[];
}

@Component({
  selector: 'app-manpower-schedule-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DateInputComponent],
  templateUrl: './manpower-schedule-list.component.html',
  styleUrl: './manpower-schedule-list.component.scss'
})
export class ManpowerScheduleListComponent implements OnInit {
  // usp_GetManpowerScheduleSideList takes only @PeriodId (no Branch/Month/Year filter) - the
  // whole period's documents come back in one call, already grouped/ordered by Month(DocDate).
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);

  collapsed = signal<Set<string>>(new Set());

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);
  private moduleCode = 0;

  // Per-column filter text, mirrors Daily Site/Store Indent's own list filter convention.
  filters = signal({ docNo: '', docDate: '' });

  filteredRows = computed<any[]>(() => {
    const f = this.filters();
    return this.rows().filter(row => {
      if (f.docNo && !String(this.read(row, 'DocNo') ?? '').toLowerCase().includes(f.docNo.toLowerCase())) return false;
      if (f.docDate && this.toDateFilterValue(this.read(row, 'DocDate')) !== f.docDate) return false;
      return true;
    });
  });

  monthGroups = computed<MonthGroup[]>(() => {
    const groups: MonthGroup[] = [];
    const indexByKey = new Map<string, number>();
    for (const row of this.filteredRows()) {
      const key = this.read(row, 'Month') ?? '(none)';
      if (!indexByKey.has(key)) {
        indexByKey.set(key, groups.length);
        groups.push({ key, label: key, rows: [] });
      }
      groups[indexByKey.get(key)!].rows.push(row);
    }
    return groups;
  });

  constructor(
    private service: ManpowerScheduleService,
    public settings: SettingsService,
    private router: Router,
    private approvalService: ApprovalService,
    private userRightsService: UserRightsService,
    private confirmDialog: ConfirmDialogService
  ) {
    // SettingsService.init() (kicked off once by ErpShellComponent) resolves periodId
    // asynchronously - calling refresh() straight from ngOnInit would fire with periodId still at
    // its 0 default on a fresh page load, returning nothing, with no later retry. Matches the
    // Accounts module's own list components (e.g. PaymentVoucherListComponent): refresh whenever
    // periodId actually has a real value, not just once up front.
    effect(() => {
      if (this.settings.periodId()) this.refresh();
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.loadRights();
    this.loadApprovalSettings();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private loadApprovalSettings(): void {
    this.approvalService.getSettings(FORM_CLASS_NAME).subscribe({
      next: settings => { this.moduleCode = settings.moduleCode; },
      error: () => {}
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getSideList(this.settings.periodId()).subscribe({
      next: (data) => {
        this.rows.set(data ?? []);
        this.collapseAllGroups();
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load list. Check the API connection.'); this.loading.set(false); }
    });
  }

  updateFilter(field: keyof ReturnType<typeof this.filters>, value: string): void {
    this.filters.set({ ...this.filters(), [field]: value });
  }

  clearFilters(): void {
    this.filters.set({ docNo: '', docDate: '' });
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

  toggle(key: string): void {
    const next = new Set(this.collapsed());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.collapsed.set(next);
  }

  isCollapsed(key: string): boolean {
    return this.collapsed().has(key);
  }

  private collapseAllGroups(): void {
    this.collapsed.set(new Set(this.monthGroups().map(g => g.key)));
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/manpower-schedule', 0]);
  }

  open(row: any): void {
    this.router.navigate(['/manpower-schedule', this.read(row, 'Code')]);
  }

  // Matches Store Indent's DeleteButton_Click flow: Lock check, then verify/clear other users'
  // pending approval actions before actually deleting - same generic ApprovalService convention.
  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();

    const id = Number(this.read(row, 'Code'));
    if (!id) {
      this.errorMessage.set('Choose an item to delete...!');
      return;
    }

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete the item ?'))) return;

    this.errorMessage.set(null);

    if (!this.moduleCode) {
      this.performDelete(id);
      return;
    }

    this.approvalService.getStatus(this.moduleCode, id).subscribe({
      next: status => {
        if (this.read(status.action, 'IsLocked') === 'L') {
          this.errorMessage.set('Deletion Not Permitted !!! This record has been Locked!');
          return;
        }
        this.deleteWithActionCheck(id);
      },
      error: () => this.deleteWithActionCheck(id)
    });
  }

  private deleteWithActionCheck(id: number): void {
    this.approvalService.verify(FORM_CLASS_NAME, id).subscribe({
      next: async ({ count }) => {
        if (count > 0) {
          if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
          this.approvalService.clearActions(FORM_CLASS_NAME, id, this.moduleCode).subscribe({
            next: () => this.performDelete(id),
            error: () => this.errorMessage.set('Transaction Failed...')
          });
        } else {
          this.performDelete(id);
        }
      },
      error: () => this.performDelete(id)
    });
  }

  private performDelete(id: number): void {
    this.deleting.set(true);
    this.service.delete(id, this.settings.branchCode(), this.settings.periodId()).subscribe({
      next: (res: any) => {
        this.deleting.set(false);
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.refresh();
      },
      error: () => { this.deleting.set(false); this.errorMessage.set('Could not delete the item. Check the API connection.'); }
    });
  }
}
