import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VehicleServiceRepairService } from '../services/vehicle-service-repair.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

// Matches this.GetType().ToString() in the desktop app's convention - kept in sync with
// VehicleServiceRepairController.FormClassName and the detail component's own constant.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.VehicleServiceRepair';

@Component({
  selector: 'app-vehicle-service-repair-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vehicle-service-repair-list.component.html',
  styleUrl: './vehicle-service-repair-list.component.scss'
})
export class VehicleServiceRepairListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);
  searchText = signal('');

  filteredRows = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(this.read(row, 'DocNo') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'RegistrationNo') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'ServiceType') ?? '').toLowerCase().includes(term)
    );
  });

  // Matches desktop's CheckPermission() (myUserRights.ADD/DELETE) - gates "+ New" and Delete.
  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);
  private moduleCode = 0;

  constructor(
    private service: VehicleServiceRepairService,
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
    this.service.getList().subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load Vehicle Service/Repair records.'); this.loading.set(false); }
    });
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/vehicle-service-repair/0']);
  }

  open(row: any): void {
    const code = this.read(row, 'Code');
    this.router.navigate(['/vehicle-service-repair', code]);
  }

  printRow(row: any, event: Event): void {
    event.stopPropagation();
    const code = this.read(row, 'Code');
    const a = document.createElement('a');
    a.href = `/vehicle-service-repair/${code}/print`;
    a.target = '_blank';
    a.click();
  }

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();
    const code = Number(this.read(row, 'Code'));
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
    this.service.delete(code, 0).subscribe({
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
