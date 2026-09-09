import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { StoreIndentService } from '../services/store-indent.service';
import { SettingsService } from '../../core/services/settings.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Purchase.StoreIndent';

interface BranchGroup {
  key: string;
  label: string;
  customerGroups: CustomerGroup[];
}

interface CustomerGroup {
  key: string;
  label: string;
  rows: any[];
}

interface StatusGroup {
  key: string;
  label: string;
  branchGroups: BranchGroup[];
}

@Component({
  selector: 'app-store-indent-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './store-indent-list.component.html',
  styleUrl: './store-indent-list.component.scss'
})
export class StoreIndentListComponent implements OnInit {
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

  // Matches desktop's CheckPermission() (myUserRights.ADD/DELETE) - gates "+ New" and Delete.
  rights = signal<UserRights>(NO_RIGHTS);
  private moduleCode = 0;

  filters = signal({ docNo: '', docDate: '', details: '', type: '' });

  filteredRows = computed<any[]>(() => {
    const f = this.filters();
    return this.rows().filter(row => {
      if (f.docNo && !String(this.read(row, 'PurReqnNo') ?? '').toLowerCase().includes(f.docNo.toLowerCase())) return false;
      if (f.docDate && this.toDateFilterValue(this.read(row, 'PReqnDate')) !== f.docDate) return false;
      if (f.details && !String(this.read(row, 'ReqnDetails') ?? '').toLowerCase().includes(f.details.toLowerCase())) return false;
      if (f.type && !String(this.read(row, 'RequisitionType') ?? '').toLowerCase().includes(f.type.toLowerCase())) return false;
      return true;
    });
  });

  statusGroups = computed<StatusGroup[]>(() => this.buildGroups(this.filteredRows()));

  constructor(
    private storeIndentService: StoreIndentService,
    private settings: SettingsService,
    private router: Router,
    private approvalService: ApprovalService,
    private userRightsService: UserRightsService,
    private confirmDialog: ConfirmDialogService
  ) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 5; y <= currentYear + 1; y++) this.years.push(y);
  }

  ngOnInit(): void {
    this.refresh();
    this.loadRights();
    this.loadApprovalSettings();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => this.rights.set(rights),
      error: () => this.rights.set(NO_RIGHTS)
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
    const branchCode = this.settings.branchCode();
    const periodId = this.settings.periodId();
    this.storeIndentService.getList(branchCode, this.selectedMonth, periodId, this.selectedYear).subscribe({
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

  // Status -> BranchName -> CustomerName. Each row also carries its own BgColour (Approved=green /
  // Waiting For Approval=yellow, from the GetStoreIndent SP - same as the desktop grid's RowStyle),
  // so the status is visible both as a group header and as the row's own color.
  private buildGroups(rows: any[]): StatusGroup[] {
    const statusMap = new Map<string, Map<string, Map<string, any[]>>>();

    for (const row of rows) {
      const statusKey = this.read(row, 'Status') ?? '(none)';
      const branchKey = this.read(row, 'BranchName') ?? '(none)';
      const customerKey = this.read(row, 'CustomerName') ?? '(none)';

      if (!statusMap.has(statusKey)) statusMap.set(statusKey, new Map());
      const branchMap = statusMap.get(statusKey)!;

      if (!branchMap.has(branchKey)) branchMap.set(branchKey, new Map());
      const customerMap = branchMap.get(branchKey)!;

      if (!customerMap.has(customerKey)) customerMap.set(customerKey, []);
      customerMap.get(customerKey)!.push(row);
    }

    const statusGroups: StatusGroup[] = [];
    for (const [statusKey, branchMap] of statusMap) {
      const branchGroups: BranchGroup[] = [];
      for (const [branchKey, customerMap] of branchMap) {
        const customerGroups: CustomerGroup[] = [];
        for (const [customerKey, groupRows] of customerMap) {
          customerGroups.push({ key: `${statusKey}|${branchKey}|${customerKey}`, label: customerKey, rows: groupRows });
        }
        branchGroups.push({ key: `${statusKey}|${branchKey}`, label: branchKey, customerGroups });
      }
      statusGroups.push({ key: statusKey, label: statusKey, branchGroups });
    }
    return statusGroups;
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
    for (const status of this.statusGroups()) {
      keys.add(status.key);
      for (const branch of status.branchGroups) {
        keys.add(branch.key);
        for (const customer of branch.customerGroups) keys.add(customer.key);
      }
    }
    this.collapsed.set(keys);
  }

  // "+ New" navigates in the current tab, same as editing a row - only switching to a different
  // form/module (the flyout menu links) opens a new tab.
  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/store-indent', 0]);
  }

  // Editing an existing row navigates in the current tab, same as any normal web link.
  open(row: any): void {
    this.router.navigate(['/store-indent', this.read(row, 'Code')]);
  }

  // Matches desktop's DeleteButton_Click / FillActions: Delete requires the DELETE right, is
  // disabled outright once the record's approval status is Approved (FillActions sets
  // DeleteButton.IsEnabled = false when Status == "A"), and is refused if the record is currently
  // Locked (checked at click time against "Unlocked").
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

    if (String(this.read(row, 'Status') ?? '').toUpperCase() === 'APPROVED') {
      this.errorMessage.set('This requisition has been Approved and cannot be deleted.');
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
          this.errorMessage.set('Deletion Not Permitted !!! This Requisition has been Locked!');
          return;
        }
        this.performDelete(id);
      },
      // No approval configuration for this record/user - matches desktop, which leaves the
      // lock check un-applied (defaults to "Unlocked") when there is nothing to check against.
      error: () => this.performDelete(id)
    });
  }

  private performDelete(id: number): void {
    this.deleting.set(true);
    this.storeIndentService.delete(id).subscribe({
      next: (res: any) => {
        this.deleting.set(false);
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.refresh();
      },
      error: () => { this.deleting.set(false); this.errorMessage.set('Could not delete the item. Check the API connection.'); }
    });
  }
}
