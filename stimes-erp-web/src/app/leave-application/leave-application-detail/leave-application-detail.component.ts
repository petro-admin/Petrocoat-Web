import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LeaveApplicationService } from '../services/leave-application.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { DateInputComponent } from '../../shared/date-input/date-input.component';

// Matches this.GetType().ToString() in the desktop app's convention EXACTLY (not a fresh/independent
// name like some other ported modules) - Leave Application shares its table, stored procedures and
// approval configuration (AdminModuleInfo ModuleCode 205) with the desktop LeaveApplicationForm, so
// records created on one side are fully visible/editable on the other.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Payroll_System.LeaveApplicationForm';

// Matches desktop's ValidateCLDays() hard-coding RequestTypeCode == "1" as Casual Leave (confirmed
// against LeaveTypeInfo: 1=Casual, 2=Maternity, 3=Annual, 4=Sick, 5=Emergency).
const CASUAL_LEAVE_TYPE_CODE = 1;

@Component({
  selector: 'app-leave-application-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DateInputComponent],
  templateUrl: './leave-application-detail.component.html',
  styleUrl: './leave-application-detail.component.scss'
})
export class LeaveApplicationDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  requestId = 0;

  loading = signal(false);
  saving = signal(false);
  uploading = signal(false);
  errorMessage = signal<string | null>(null);

  leaveTypes = signal<any[]>([]);
  employees = signal<any[]>([]);
  employeeText = signal('');
  selectedEmployee = signal<any>(null);

  availableDays = signal<number | null>(null);

  // Approval workflow (Lock/Approve/Deny) - same generic pattern as Vehicle Service/Repair.
  approvalEnabled = signal(false);
  moduleCode = 0;
  approvalVisible = signal(false);
  approvalAction = signal<any>(null);
  approvalHistory = signal<any[][] | null>(null);
  approvalComment = signal('');
  approvalBusy = signal(false);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: LeaveApplicationService,
    public settings: SettingsService,
    private confirmDialog: ConfirmDialogService,
    private approvalService: ApprovalService,
    private userRightsService: UserRightsService
  ) {
    this.form = this.fb.group({
      requestNo: [{ value: '', disabled: true }],
      docDate: ['', Validators.required],
      requestTypeCode: [null, Validators.required],
      fromDate: ['', Validators.required],
      toDate: ['', Validators.required],
      paidLeaveChecked: [false],
      paidLeave: [0],
      halfDay: [false],
      rejoin: [''],
      path: [''],
      originalName: [''],
      remarks: ['']
    });

    // app-date-input only bubbles a native DOM 'change' when its calendar icon is used, not when
    // typed - so From/To Date recalculation is driven from the form control's own valueChanges
    // instead of a template event binding.
    this.form.get('fromDate')?.valueChanges.subscribe(() => this.onDateChanged());
    this.form.get('toDate')?.valueChanges.subscribe(() => this.onDateChanged());
  }

  ngOnInit(): void {
    this.requestId = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.requestId === 0;

    this.loadRights();
    this.loadApprovalSettings();
    this.service.getLeaveTypes().subscribe({
      next: rows => this.leaveTypes.set(rows ?? []),
      error: () => this.errorMessage.set('Could not load leave types.')
    });
    this.service.getEmployees().subscribe({
      next: rows => {
        this.employees.set(rows ?? []);
        if (!this.isNew) this.loadExisting();
      },
      error: () => this.errorMessage.set('Could not load employee list.')
    });

    if (this.isNew) {
      this.form.patchValue({ docDate: this.today() });
      this.service.generateDocNo().subscribe({ next: res => this.form.patchValue({ requestNo: res?.requestNo ?? '' }) });
    }
  }

  private today(): string {
    const processingDate = this.settings.processingDate() ?? new Date();
    return processingDate.toISOString().substring(0, 10);
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private loadApprovalSettings(): void {
    this.approvalService.getSettings(FORM_CLASS_NAME).subscribe({
      next: settings => {
        this.approvalEnabled.set(settings.isApproval);
        this.moduleCode = settings.moduleCode;
        if (settings.isApproval && !this.isNew) this.loadApprovalStatus();
      },
      error: () => {}
    });
  }

  private loadApprovalStatus(): void {
    this.approvalService.getStatus(this.moduleCode, this.requestId).subscribe({
      next: status => { this.approvalVisible.set(status.visible); this.approvalAction.set(status.action ?? null); },
      error: () => {}
    });
  }

  isApproved(): boolean {
    return this.read(this.approvalAction(), 'CurrentStatus') === 'A';
  }

  canSave(): boolean {
    return (this.isNew ? this.rights().add : this.rights().edit) && !this.isApproved();
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getById(this.requestId).subscribe({
      next: res => {
        const employee = this.employees().find(e => this.toNumber(this.read(e, 'EmployeeCode')) === this.toNumber(this.read(res, 'EmployeeCode')));
        this.selectedEmployee.set(employee ?? null);
        this.employeeText.set(employee ? this.employeeDisplay(employee) : (this.read(res, 'EmpID_FullName') ?? ''));

        this.form.patchValue({
          requestNo: this.read(res, 'RequestNo') ?? '',
          docDate: this.toDateInputValue(this.read(res, 'DocDate')) || this.today(),
          requestTypeCode: this.toNumber(this.read(res, 'RequestTypeCode')),
          fromDate: this.toDateInputValue(this.read(res, 'FromDate')),
          toDate: this.toDateInputValue(this.read(res, 'ToDate')),
          paidLeaveChecked: this.read(res, 'chkPaidLeave') === 'Y',
          paidLeave: this.read(res, 'PaidLeave') ?? 0,
          halfDay: this.read(res, 'HalfDay') === 'Y',
          rejoin: this.toDateInputValue(this.read(res, 'Rejoin')),
          path: this.read(res, 'Paths') ?? '',
          originalName: this.pathFileName(this.read(res, 'Paths')),
          remarks: this.read(res, 'Remarks') ?? ''
        });

        if (this.approvalEnabled()) this.loadApprovalStatus();
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this Leave Application.'); this.loading.set(false); }
    });
  }

  // ---------- Employee picker (type-to-filter, matches desktop's txtEmpID RadAutoCompleteBox) ----------
  employeeDisplay(row: any): string {
    return `${this.read(row, 'EmpID') ?? ''} - ${this.read(row, 'EmpFullName') ?? ''}`;
  }

  onEmployeeTextChanged(value: string): void {
    this.employeeText.set(value);
    const match = this.employees().find(e => this.employeeDisplay(e).trim().toLowerCase() === value.trim().toLowerCase());
    this.selectedEmployee.set(match ?? null);
    this.refreshAvailableBalance();
  }

  onEmployeeSelected(value: string): void { this.onEmployeeTextChanged(value); }

  onLeaveTypeChanged(): void {
    this.refreshAvailableBalance();
  }

  onDateChanged(): void {
    const from = this.form.get('fromDate')?.value;
    const to = this.form.get('toDate')?.value;
    if (from && to && new Date(to) < new Date(from)) {
      this.form.patchValue({ fromDate: '', toDate: '' });
      this.errorMessage.set('Please Enter Valid Dates');
      return;
    }
    this.refreshAvailableBalance();
  }

  get totalDays(): number {
    const from = this.form.get('fromDate')?.value;
    const to = this.form.get('toDate')?.value;
    if (!from || !to) return 0;
    const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
    if (days < 1) return 0;
    return this.form.get('halfDay')?.value ? days - 0.5 : days;
  }

  private refreshAvailableBalance(): void {
    const employee = this.selectedEmployee();
    const requestTypeCode = this.toNumber(this.form.get('requestTypeCode')?.value);
    const fromDate = this.form.get('fromDate')?.value;
    if (!employee || !requestTypeCode) { this.availableDays.set(null); return; }

    const employeeCode = this.toNumber(this.read(employee, 'EmployeeCode'));
    const asOnDate = fromDate || this.today();
    this.service.getAvailableBalance(employeeCode, requestTypeCode, asOnDate).subscribe({
      next: res => this.availableDays.set(res ? this.toNumber(this.read(res, 'AvailableDays')) : 0),
      error: () => this.availableDays.set(null)
    });
  }

  // ---------- Medical Certificate upload ----------
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading.set(true);
    this.service.uploadDocument(file, this.settings.branchCode()).subscribe({
      next: res => {
        this.form.patchValue({ path: res.fileName, originalName: res.originalName });
        this.uploading.set(false);
        input.value = '';
      },
      error: () => { this.errorMessage.set('File upload failed.'); this.uploading.set(false); input.value = ''; }
    });
  }

  viewDocument(): void {
    const path = this.form.get('path')?.value;
    if (!path) return;
    this.service.downloadDocument(path).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 30000);
      },
      error: () => this.errorMessage.set('Could not open the file.')
    });
  }

  private pathFileName(path: unknown): string {
    const text = this.toText(path);
    if (!text) return '';
    const parts = text.split(/[\\/]/);
    return parts[parts.length - 1] ?? text;
  }

  // ---------- Approval workflow ----------
  async toggleLock(): Promise<void> {
    if (this.isNew) return;
    const locked = this.read(this.approvalAction(), 'IsLocked') === 'L';
    const confirmMsg = locked ? 'Are you sure to Unlock this record ?' : 'Are you sure to Lock this record ?';
    if (!(await this.confirmDialog.confirm(confirmMsg))) return;

    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.requestId, 'L', locked ? 'U' : 'L', this.approvalComment()).subscribe({
      next: (res) => { this.approvalBusy.set(false); this.confirmDialog.notify(res?.result ?? ''); this.loadApprovalStatus(); },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not update lock status.'); }
    });
  }

  approve(): void { this.actOnApproval('A', 'Approved!!'); }
  deny(): void { this.actOnApproval('D', 'Denied!!'); }

  private actOnApproval(action: string, successMessage: string): void {
    if (this.isNew) return;
    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.requestId, 'A', action, this.approvalComment()).subscribe({
      next: () => { this.approvalBusy.set(false); this.confirmDialog.notify(successMessage); this.loadApprovalStatus(); },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not record the approval action.'); }
    });
  }

  loadApprovalHistory(): void {
    this.approvalService.getHistory(this.moduleCode, this.requestId).subscribe({
      next: tables => this.approvalHistory.set(tables ?? []),
      error: () => this.errorMessage.set('Could not load approval history.')
    });
  }

  updateApprovalComment(value: string): void { this.approvalComment.set(value); }

  objectKeys(obj: any): string[] { return obj ? Object.keys(obj) : []; }

  // ---------- Save / Delete ----------
  async save(): Promise<void> {
    if (!this.canSave()) {
      this.errorMessage.set(this.isApproved() ? 'This record has been Approved and cannot be updated.' : 'You do not have permission to add.');
      return;
    }
    if (this.form.invalid || !this.selectedEmployee()) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please fill in Employee, Leave Type, From Date and To Date.');
      return;
    }

    // Matches desktop's ValidateCLDays(): only for Casual Leave.
    if (this.toNumber(this.form.get('requestTypeCode')?.value) === CASUAL_LEAVE_TYPE_CODE) {
      if (this.totalDays > 2) {
        this.errorMessage.set('Two Day(s) only allowed per month!');
        this.form.patchValue({ fromDate: '', toDate: '' });
        return;
      }
      if (this.availableDays() != null && this.totalDays > this.availableDays()!) {
        this.errorMessage.set('Requested days exceed your available Casual Leave balance!');
        this.form.patchValue({ fromDate: '', toDate: '' });
        return;
      }
    }

    // Matches desktop's Save-time re-check: new records need a positive balance; edits are exempt.
    if (this.isNew && this.availableDays() != null && this.availableDays()! <= 0) {
      this.errorMessage.set('Insufficient leave balance. Leave is not available.');
      return;
    }

    if (!this.isNew) {
      this.approvalService.verify(FORM_CLASS_NAME, this.requestId).subscribe({
        next: async ({ count }) => {
          if (count > 0) {
            if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
            this.approvalService.clearActions(FORM_CLASS_NAME, this.requestId, this.moduleCode).subscribe({
              next: () => this.doSave(),
              error: () => this.errorMessage.set('Transaction Failed...')
            });
          } else {
            this.doSave();
          }
        },
        error: () => this.doSave()
      });
    } else {
      this.doSave();
    }
  }

  private doSave(): void {
    this.saving.set(true);
    this.errorMessage.set(null);
    const wasNew = this.isNew;
    const v = this.form.getRawValue();
    const employee = this.selectedEmployee();

    const payload = {
      requestId: this.requestId,
      requestNo: this.toText(v.requestNo),
      requestTypeCode: this.toNumber(v.requestTypeCode),
      employeeCode: this.toNumber(this.read(employee, 'EmployeeCode')),
      docDate: v.docDate,
      fromDate: v.fromDate || null,
      toDate: v.toDate || null,
      remarks: this.toText(v.remarks),
      totalLeaveDays: this.totalDays,
      paidLeaveChecked: !!v.paidLeaveChecked,
      paidLeave: this.toNumber(v.paidLeave),
      rejoin: v.rejoin || null,
      path: this.toText(v.path) || null,
      halfDay: !!v.halfDay
    };

    this.service.save(payload, this.settings.periodId(), this.settings.branchCode(), this.settings.companyCode()).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.confirmDialog.notify(res?.result || (wasNew ? 'Leave Request Saved Successfully' : 'Leave Request Updated Successfully'));
        this.router.navigate(['/leave-application']);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.message || 'Save failed. Check the API console for details.');
      }
    });
  }

  async deleteRecord(): Promise<void> {
    if (this.isNew) return;

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }
    if (this.isApproved()) {
      this.errorMessage.set('This record has been Approved and cannot be deleted.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete this record ?'))) return;
    this.errorMessage.set(null);

    if (!this.moduleCode) { this.performDelete(); return; }

    this.approvalService.getStatus(this.moduleCode, this.requestId).subscribe({
      next: status => {
        if (this.read(status.action, 'IsLocked') === 'L') {
          this.errorMessage.set('Deletion Not Permitted !!! This record has been Locked!');
          return;
        }
        this.deleteWithActionCheck();
      },
      error: () => this.deleteWithActionCheck()
    });
  }

  private deleteWithActionCheck(): void {
    this.approvalService.verify(FORM_CLASS_NAME, this.requestId).subscribe({
      next: async ({ count }) => {
        if (count > 0) {
          if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
          this.approvalService.clearActions(FORM_CLASS_NAME, this.requestId, this.moduleCode).subscribe({
            next: () => this.performDelete(),
            error: () => this.errorMessage.set('Transaction Failed...')
          });
        } else {
          this.performDelete();
        }
      },
      error: () => this.performDelete()
    });
  }

  private performDelete(): void {
    this.saving.set(true);
    const requestNo = this.toText(this.form.get('requestNo')?.value);
    this.service.delete(this.requestId, requestNo, this.settings.periodId(), this.settings.branchCode(), this.settings.companyCode()).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.confirmDialog.notify(res?.result || 'Leave Request Deleted Successfully');
        this.router.navigate(['/leave-application']);
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not delete the record.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/leave-application']);
  }

  print(): void {
    const a = document.createElement('a');
    a.href = `/leave-application/${this.requestId}/print`;
    a.target = '_blank';
    a.click();
  }

  // ---------- Helpers ----------
  private toDateInputValue(value: unknown): string {
    if (!value) return '';
    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
    return match?.[0] ?? '';
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

  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  toText(value: unknown): string {
    return value == null ? '' : String(value);
  }
}
