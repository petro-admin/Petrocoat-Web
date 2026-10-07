import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LeaveApplicationService } from '../services/leave-application.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

// Matches this.GetType().ToString() in the desktop app's convention exactly - the same
// FormClassName desktop's LeaveApplicationForm uses (AdminModuleInfo ModuleCode 205, already
// registered), kept in sync with LeaveApplicationController.FormClassName.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Payroll_System.LeaveApplicationForm';

// Matches desktop's gvSide grouping exactly: BranchName, then Year, then Month (3 group
// descriptors applied to the same usp_GetPayroll_LeaveRequestDetails result set desktop uses).
interface MonthGroup {
  key: string;
  label: string;
  rows: any[];
}

interface YearGroup {
  key: string;
  label: string;
  monthGroups: MonthGroup[];
}

interface BranchGroup {
  key: string;
  label: string;
  yearGroups: YearGroup[];
}

@Component({
  selector: 'app-leave-application-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leave-application-list.component.html',
  styleUrl: './leave-application-list.component.scss'
})
export class LeaveApplicationListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);
  searchText = signal('');

  // 0 = all years - matches desktop's ddlYear "All" option.
  year = signal(new Date().getFullYear());
  years = computed(() => {
    const current = new Date().getFullYear();
    return [0, ...Array.from({ length: 6 }, (_, i) => current - i)];
  });

  filteredRows = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(this.read(row, 'RequestNo') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'EmpFullName') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'LeaveTypeDesc') ?? '').toLowerCase().includes(term)
    );
  });

  branchGroups = computed<BranchGroup[]>(() => this.buildGroups(this.filteredRows()));
  collapsed = signal<Set<string>>(new Set());

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);
  private moduleCode = 0;

  constructor(
    private service: LeaveApplicationService,
    public settings: SettingsService,
    private router: Router,
    private confirmDialog: ConfirmDialogService,
    private approvalService: ApprovalService,
    private userRightsService: UserRightsService
  ) {}

  ngOnInit(): void {
    this.refresh();
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
    this.service.getList(this.year()).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); this.collapseAllGroups(); },
      error: () => { this.errorMessage.set('Could not load Leave Application records.'); this.loading.set(false); }
    });
  }

  private buildGroups(rows: any[]): BranchGroup[] {
    const branchMap = new Map<string, Map<string, Map<string, any[]>>>();

    for (const row of rows) {
      const branchKey = this.read(row, 'BranchName') ?? '(none)';
      const yearKey = String(this.read(row, 'Year') ?? '(none)');
      const monthKey = this.read(row, 'Month') ?? '(none)';

      if (!branchMap.has(branchKey)) branchMap.set(branchKey, new Map());
      const yearMap = branchMap.get(branchKey)!;

      if (!yearMap.has(yearKey)) yearMap.set(yearKey, new Map());
      const monthMap = yearMap.get(yearKey)!;

      if (!monthMap.has(monthKey)) monthMap.set(monthKey, []);
      monthMap.get(monthKey)!.push(row);
    }

    const branchGroups: BranchGroup[] = [];
    for (const [branchKey, yearMap] of branchMap) {
      const yearGroups: YearGroup[] = [];
      for (const [yearKey, monthMap] of yearMap) {
        const monthGroups: MonthGroup[] = [];
        for (const [monthKey, groupRows] of monthMap) {
          monthGroups.push({ key: `${branchKey}|${yearKey}|${monthKey}`, label: monthKey, rows: groupRows });
        }
        yearGroups.push({ key: `${branchKey}|${yearKey}`, label: yearKey, monthGroups });
      }
      branchGroups.push({ key: branchKey, label: branchKey, yearGroups });
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
      for (const year of branch.yearGroups) {
        keys.add(year.key);
        for (const month of year.monthGroups) keys.add(month.key);
      }
    }
    this.collapsed.set(keys);
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/leave-application/0']);
  }

  open(row: any): void {
    this.router.navigate(['/leave-application', this.read(row, 'RequestID')]);
  }

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();
    const requestId = this.toNumber(this.read(row, 'RequestID'));
    const requestNo = this.read(row, 'RequestNo') ?? '';
    if (!requestId) return;

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete this record ?'))) return;
    this.errorMessage.set(null);

    if (!this.moduleCode) {
      this.performDelete(requestId, requestNo);
      return;
    }

    this.approvalService.getStatus(this.moduleCode, requestId).subscribe({
      next: status => {
        if (this.read(status.action, 'CurrentStatus') === 'A') {
          this.errorMessage.set('This record has been Approved and cannot be deleted.');
          return;
        }
        if (this.read(status.action, 'IsLocked') === 'L') {
          this.errorMessage.set('Deletion Not Permitted !!! This record has been Locked!');
          return;
        }
        this.deleteWithActionCheck(requestId, requestNo);
      },
      error: () => this.deleteWithActionCheck(requestId, requestNo)
    });
  }

  private deleteWithActionCheck(requestId: number, requestNo: string): void {
    this.approvalService.verify(FORM_CLASS_NAME, requestId).subscribe({
      next: async ({ count }) => {
        if (count > 0) {
          if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
          this.approvalService.clearActions(FORM_CLASS_NAME, requestId, this.moduleCode).subscribe({
            next: () => this.performDelete(requestId, requestNo),
            error: () => this.errorMessage.set('Transaction Failed...')
          });
        } else {
          this.performDelete(requestId, requestNo);
        }
      },
      error: () => this.performDelete(requestId, requestNo)
    });
  }

  private performDelete(requestId: number, requestNo: string): void {
    this.deleting.set(true);
    this.service.delete(requestId, requestNo, this.settings.periodId(), this.settings.branchCode(), this.settings.companyCode()).subscribe({
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
