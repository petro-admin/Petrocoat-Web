import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ResourceReturnService } from '../services/resource-return.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

// Matches this.GetType().ToString() in the desktop app's convention exactly - the desktop
// source's own class name has a typo ("ResourceRetrurn"), kept as-is (ModuleCode 331, already
// registered) so permissions/approval config stay shared between the two apps.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Production.ResourceRetrurn';

// Matches desktop's gvSide grouping exactly - BranchName, then sono (Sales Order + Customer, or
// "GENERAL" when the Resource Issue isn't tied to a Sales Order).
interface SonoGroup {
  key: string;
  label: string;
  rows: any[];
}

interface BranchGroup {
  key: string;
  label: string;
  sonoGroups: SonoGroup[];
}

@Component({
  selector: 'app-resource-return-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './resource-return-list.component.html',
  styleUrl: './resource-return-list.component.scss'
})
export class ResourceReturnListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);
  searchText = signal('');

  filteredRows = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(this.read(row, 'MatReturnNo') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'JobDesc') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'sono') ?? '').toLowerCase().includes(term)
    );
  });

  branchGroups = computed<BranchGroup[]>(() => this.buildGroups(this.filteredRows()));
  collapsed = signal<Set<string>>(new Set());

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);
  private moduleCode = 0;

  constructor(
    private service: ResourceReturnService,
    private settings: SettingsService,
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
    this.service.getList(this.settings.periodId(), this.settings.branchCode(), this.settings.companyCode()).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); this.collapseAllGroups(); },
      error: () => { this.errorMessage.set('Could not load Resource Return records.'); this.loading.set(false); }
    });
  }

  private buildGroups(rows: any[]): BranchGroup[] {
    const branchMap = new Map<string, Map<string, any[]>>();

    for (const row of rows) {
      const branchKey = this.read(row, 'BranchName') ?? '(none)';
      const sonoKey = this.read(row, 'sono') ?? 'GENERAL';

      if (!branchMap.has(branchKey)) branchMap.set(branchKey, new Map());
      const sonoMap = branchMap.get(branchKey)!;

      if (!sonoMap.has(sonoKey)) sonoMap.set(sonoKey, []);
      sonoMap.get(sonoKey)!.push(row);
    }

    const branchGroups: BranchGroup[] = [];
    for (const [branchKey, sonoMap] of branchMap) {
      const sonoGroups: SonoGroup[] = [];
      for (const [sonoKey, groupRows] of sonoMap) {
        sonoGroups.push({ key: `${branchKey}|${sonoKey}`, label: sonoKey, rows: groupRows });
      }
      branchGroups.push({ key: branchKey, label: branchKey, sonoGroups });
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
      for (const sono of branch.sonoGroups) keys.add(sono.key);
    }
    this.collapsed.set(keys);
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/resource-return/0']);
  }

  open(row: any): void {
    this.router.navigate(['/resource-return', this.read(row, 'MatReturnCode')]);
  }

  printRow(row: any, event: Event): void {
    event.stopPropagation();
    const code = this.read(row, 'MatReturnCode');
    const a = document.createElement('a');
    a.href = `/resource-return/${code}/print`;
    a.target = '_blank';
    a.click();
  }

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();
    const code = this.toNumber(this.read(row, 'MatReturnCode'));
    if (!code) return;

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete this record ?'))) return;
    this.errorMessage.set(null);

    if (!this.moduleCode) {
      this.performDelete(code);
      return;
    }

    this.approvalService.getStatus(this.moduleCode, code).subscribe({
      next: status => {
        if (this.read(status.action, 'CurrentStatus') === 'A') {
          this.errorMessage.set('This record has been Approved and cannot be deleted.');
          return;
        }
        if (this.read(status.action, 'IsLocked') === 'L') {
          this.errorMessage.set('Deletion Not Permitted !!! This record has been Locked!');
          return;
        }
        this.deleteWithActionCheck(code);
      },
      error: () => this.deleteWithActionCheck(code)
    });
  }

  private deleteWithActionCheck(code: number): void {
    this.approvalService.verify(FORM_CLASS_NAME, code).subscribe({
      next: async ({ count }) => {
        if (count > 0) {
          if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
          this.approvalService.clearActions(FORM_CLASS_NAME, code, this.moduleCode).subscribe({
            next: () => this.performDelete(code),
            error: () => this.errorMessage.set('Transaction Failed...')
          });
        } else {
          this.performDelete(code);
        }
      },
      error: () => this.performDelete(code)
    });
  }

  private performDelete(code: number): void {
    this.deleting.set(true);
    this.service.delete(code, this.settings.branchCode(), this.settings.companyCode()).subscribe({
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
