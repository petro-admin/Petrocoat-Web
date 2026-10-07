import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { VehicleServiceRepairService } from '../services/vehicle-service-repair.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { DateInputComponent } from '../../shared/date-input/date-input.component';

// Matches this.GetType().ToString() in the desktop app's convention - the key
// usp_admin_GetApprovalSettingsHDR_By_FormClassName / usp_GetUserRightSecurity look up
// configuration by. Kept in sync with VehicleServiceRepairController.FormClassName.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.VehicleServiceRepair';

@Component({
  selector: 'app-vehicle-service-repair-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DateInputComponent],
  templateUrl: './vehicle-service-repair-detail.component.html',
  styleUrl: './vehicle-service-repair-detail.component.scss'
})
export class VehicleServiceRepairDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);
  uploadingSlNo = signal<number | null>(null);

  vehicles = signal<any[]>([]);
  drivers = signal<any[]>([]);

  // Approval workflow (Lock/Approve/Deny) - matches Store Indent's ISApprove_userandform / FillActions.
  approvalEnabled = signal(false);
  moduleCode = 0;
  approvalVisible = signal(false);
  approvalAction = signal<any>(null);
  approvalHistory = signal<any[][] | null>(null);
  approvalComment = signal('');
  approvalBusy = signal(false);

  // Matches desktop's CheckPermission() (myUserRights.ADD/DELETE).
  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  get items(): FormArray { return this.form.get('items') as FormArray; }
  get documents(): FormArray { return this.form.get('documents') as FormArray; }

  private collapsedItemGroups = new Set<string>();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: VehicleServiceRepairService,
    public settings: SettingsService,
    private confirmDialog: ConfirmDialogService,
    private approvalService: ApprovalService,
    private userRightsService: UserRightsService
  ) {
    this.form = this.fb.group({
      docNo: [{ value: '', disabled: true }],
      docDate: ['', Validators.required],
      vehicleCode: [null, Validators.required],
      branchCode: [null],
      driverCode: [null],
      serviceType: ['REPAIR'],
      currentKM: [0],
      nextServiceKM: [0],
      serviceDate: [''],
      nextServiceDueDate: [''],
      remarks: [''],
      active: [true],
      statusCode: [1],
      completedDate: [''],
      discountAmount: [0],
      items: this.fb.array([]),
      documents: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.isNew = this.code === 0;

    this.loadVehicles();
    this.loadDrivers();
    this.loadRights();
    this.loadApprovalSettings();

    if (this.isNew) {
      this.service.generateDocNo().subscribe(res => {
        this.form.patchValue({ docNo: res.docNo, docDate: this.today() });
      });
      this.form.patchValue({ branchCode: this.settings.branchCode() });
      this.addItemRow();
      this.addDocumentRow();
    } else {
      this.loadExisting();
    }
  }

  onStatusChanged(): void {
    const statusCode = this.toNumber(this.form.get('statusCode')?.value);
    if (statusCode === 2 && !this.form.get('completedDate')?.value) {
      this.form.patchValue({ completedDate: this.today() });
    } else if (statusCode === 1) {
      this.form.patchValue({ completedDate: '' });
    }
  }

  private today(): string {
    const processingDate = this.settings.processingDate() ?? new Date();
    return processingDate.toISOString().substring(0, 10);
  }

  private loadVehicles(): void {
    this.service.getVehicles().subscribe({
      next: vehicles => this.vehicles.set(vehicles ?? []),
      error: () => this.errorMessage.set('Could not load vehicle list.')
    });
  }

  private loadDrivers(): void {
    this.service.getDrivers().subscribe({
      next: drivers => this.drivers.set(drivers ?? []),
      error: () => this.errorMessage.set('Could not load driver list.')
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
    this.approvalService.getStatus(this.moduleCode, this.code).subscribe({
      next: status => {
        this.approvalVisible.set(status.visible);
        this.approvalAction.set(status.action ?? null);
      },
      error: () => {}
    });
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  // Matches Store Indent's FillActions: Save is forced off once CurrentStatus == "A", on top of
  // the ADD permission check.
  isApproved(): boolean {
    return this.read(this.approvalAction(), 'CurrentStatus') === 'A';
  }

  canSave(): boolean {
    return this.rights().add && !this.isApproved();
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getById(this.code).subscribe({
      next: res => {
        const hdr = res?.Header ?? res?.header ?? {};
        this.form.patchValue({
          docNo: this.read(hdr, 'DocNo'),
          docDate: this.toDateInputValue(this.read(hdr, 'DocDate')),
          vehicleCode: this.toNumber(this.read(hdr, 'VehicleCode')),
          branchCode: this.toNumber(this.read(hdr, 'BranchCode')),
          driverCode: this.toNumber(this.read(hdr, 'DriverCode')) || null,
          serviceType: this.read(hdr, 'ServiceType') ?? 'REPAIR',
          currentKM: this.read(hdr, 'CurrentKM') ?? 0,
          nextServiceKM: this.read(hdr, 'NextServiceKM') ?? 0,
          serviceDate: this.toDateInputValue(this.read(hdr, 'ServiceDate')),
          nextServiceDueDate: this.toDateInputValue(this.read(hdr, 'NextServiceDueDate')),
          remarks: this.read(hdr, 'Remarks') ?? '',
          active: this.read(hdr, 'Active') !== 'N',
          statusCode: this.toNumber(this.read(hdr, 'StatusCode')) || 1,
          completedDate: this.toDateInputValue(this.read(hdr, 'CompletedDate')),
          discountAmount: this.read(hdr, 'DiscountAmount') ?? 0
        });

        this.items.clear();
        (this.responseArray(res, 'Items', 'items')).forEach((r: any) => this.addItemRow(r));
        if (this.items.length === 0) this.addItemRow();
        // Recompute every loaded row's Amount/VAT Amount instead of trusting the stored values
        // as-is - a record saved before per-item VAT existed has VatPercent defaulted to 5 by
        // the DB but VatAmount stuck at 0 (never actually computed), so without this the grid
        // shows a real VAT% next to a VAT Amount that was never derived from it.
        this.items.controls.forEach((_, index) => this.recalculateItemRow(index));
        this.collapseAllItemGroups();

        this.documents.clear();
        (this.responseArray(res, 'Documents', 'documents')).forEach((r: any) => this.addDocumentRow(r));
        if (this.documents.length === 0) this.addDocumentRow();

        if (this.approvalEnabled()) this.loadApprovalStatus();
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load record.'); this.loading.set(false); }
    });
  }

  // ---------- Repair/Service items ----------
  addItemRow(data?: any): void {
    this.items.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.items)],
      description: [this.read(data, 'Description') ?? ''],
      qty: [this.read(data, 'Qty') ?? 1],
      rate: [this.read(data, 'Rate') ?? 0],
      amount: [{ value: this.read(data, 'Amount') ?? 0, disabled: true }],
      vatPercent: [this.read(data, 'VatPercent') ?? 5],
      vatAmount: [{ value: this.read(data, 'VatAmount') ?? 0, disabled: true }],
      statusCode: [this.toNumber(this.read(data, 'StatusCode')) || 1],
      remarks: [this.read(data, 'Remarks') ?? ''],
      // Category from the vehicle inspection checklist auto-fill (e.g. "Vehicle Sides") - blank
      // for a manually-added row. Only used to group the grid, not shown as its own column.
      parts: [this.read(data, 'Parts') ?? '']
    }));
  }

  removeItemRow(slNo: unknown): void { this.removeRowBySlNo(this.items, slNo); }

  // Each row prices its own VAT (no single document-level rate) - Qty/Rate drive Amount, and
  // VAT Amount is always recalculated off the CURRENT Amount and this row's own VAT%, so editing
  // either Qty/Rate or VAT% on a row keeps that row's VAT Amount in sync.
  recalculateItemRow(index: number): void {
    const row = this.items.at(index);
    const qty = this.toNumber(row.get('qty')?.value);
    const rate = this.toNumber(row.get('rate')?.value);
    const amount = this.round2(qty * rate);
    const vatPercent = this.toNumber(row.get('vatPercent')?.value);
    const vatAmount = this.round2(amount * vatPercent / 100);
    row.patchValue({ amount, vatAmount }, { emitEvent: false });
  }

  // Amount + VAT Amount for one row - shown as its own grid column rather than only rolled up
  // in the footer, so each line's own VAT-inclusive price is visible without doing the math.
  rowTotalAmount(index: number): number {
    const row = this.items.at(index);
    return this.round2(this.toNumber(row.get('amount')?.value) + this.toNumber(row.get('vatAmount')?.value));
  }

  get itemsTotal(): number {
    return this.round2(this.items.getRawValue().reduce((sum: number, r: any) => sum + this.toNumber(r.amount), 0));
  }

  get itemsVatTotal(): number {
    return this.round2(this.items.getRawValue().reduce((sum: number, r: any) => sum + this.toNumber(r.vatAmount), 0));
  }

  get itemsTotalWithVat(): number {
    return this.round2(this.itemsTotal + this.itemsVatTotal);
  }

  // Discount is entered separately, outside the grid - it reduces the VAT-inclusive total, not
  // the items themselves, so Net Amount = Total Amount (incl. per-item VAT) minus the typed Discount.
  get netAmount(): number {
    return this.round2(this.itemsTotalWithVat - this.toNumber(this.form.get('discountAmount')?.value));
  }

  // Rows are always in SlNo order (from the checklist SP or appended in order), and the
  // checklist's categories are naturally laid out as contiguous blocks - so grouping is just
  // "start a new group whenever Parts changes from the previous row." Ungrouped/manually-added
  // rows (blank Parts) fall under "Other."
  itemGroups(): { key: string; label: string; indexes: number[] }[] {
    const groups: { key: string; label: string; indexes: number[] }[] = [];
    this.items.controls.forEach((row, index) => {
      const label = this.toText(row.get('parts')?.value) || 'Other';
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.indexes.push(index);
      } else {
        groups.push({ key: `${label}-${index}`, label, indexes: [index] });
      }
    });
    return groups;
  }

  toggleItemGroup(key: string): void {
    if (this.collapsedItemGroups.has(key)) this.collapsedItemGroups.delete(key);
    else this.collapsedItemGroups.add(key);
  }

  isItemGroupCollapsed(key: string): boolean {
    return this.collapsedItemGroups.has(key);
  }

  private collapseAllItemGroups(): void {
    this.collapsedItemGroups = new Set(this.itemGroups().map(g => g.key));
  }

  // Matches desktop's MachineryRepairOrBreakDownRegister.txtVehicleInspectionNo_SelectionChanged:
  // picking a vehicle auto-fills the Repair/Service Items grid from that vehicle's latest desktop
  // Vehicle Inspection checklist (read-only reference - nothing is written back to the desktop's
  // own VehicleInspectionDtl table). The mechanic then edits/prices/removes rows as needed.
  async onVehicleChanged(): Promise<void> {
    const vehicleCode = this.toNumber(this.form.get('vehicleCode')?.value);
    if (!vehicleCode) return;

    const hasData = this.items.controls.some(row => this.toText(row.get('description')?.value).trim() !== '');
    if (hasData) {
      if (!(await this.confirmDialog.confirm('Changing the vehicle replaces the current Repair/Service Items with this vehicle\'s latest inspection checklist. Continue?'))) return;
    }

    this.service.getInspectionChecklist(vehicleCode).subscribe({
      next: rows => {
        this.items.clear();
        (rows ?? []).forEach((r: any) => {
          this.addItemRow({ Description: this.read(r, 'Description'), Parts: this.read(r, 'Parts') });
        });
        if (this.items.length === 0) this.addItemRow();
        this.collapsedItemGroups.clear();
      },
      error: () => this.errorMessage.set('Could not load the inspection checklist for this vehicle.')
    });
  }

  // ---------- Documents ----------
  addDocumentRow(data?: any): void {
    this.documents.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.documents)],
      description: [this.read(data, 'Description') ?? ''],
      remarks: [this.read(data, 'Remarks') ?? ''],
      docUpload: [this.read(data, 'DocUpload') ?? ''],
      originalName: [this.read(data, 'OriginalName') ?? '']
    }));
  }

  removeDocumentRow(slNo: unknown): void { this.removeRowBySlNo(this.documents, slNo); }

  onDocumentFileSelected(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const row = this.documents.at(index);
    this.uploadingSlNo.set(this.toNumber(row.get('slNo')?.value));

    this.service.uploadDocument(file, this.settings.branchCode()).subscribe({
      next: res => {
        row.patchValue({ docUpload: res.fileName, originalName: res.originalName });
        if (!row.get('description')?.value) row.patchValue({ description: res.originalName });
        this.uploadingSlNo.set(null);
        input.value = '';
      },
      error: () => {
        this.errorMessage.set('File upload failed.');
        this.uploadingSlNo.set(null);
        input.value = '';
      }
    });
  }

  viewDocument(index: number): void {
    const row = this.documents.at(index);
    const fileName = row.get('docUpload')?.value;
    if (!fileName) return;

    this.service.downloadDocument(fileName).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 30000);
      },
      error: () => this.errorMessage.set('Could not open the file.')
    });
  }

  // ---------- Approval workflow ----------
  async toggleLock(): Promise<void> {
    if (this.isNew) return;
    const locked = this.read(this.approvalAction(), 'IsLocked') === 'L';
    const confirmMsg = locked ? 'Are you sure to Unlock this record ?' : 'Are you sure to Lock this record ?';
    if (!(await this.confirmDialog.confirm(confirmMsg))) return;

    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.code, 'L', locked ? 'U' : 'L', this.approvalComment()).subscribe({
      next: (res) => {
        this.approvalBusy.set(false);
        this.confirmDialog.notify(res?.result ?? '');
        this.loadApprovalStatus();
      },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not update lock status.'); }
    });
  }

  approve(): void { this.actOnApproval('A', 'Approved!!'); }
  deny(): void { this.actOnApproval('D', 'Denied!!'); }

  private actOnApproval(action: string, successMessage: string): void {
    if (this.isNew) return;
    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.code, 'A', action, this.approvalComment()).subscribe({
      next: () => {
        this.approvalBusy.set(false);
        this.confirmDialog.notify(successMessage);
        this.loadApprovalStatus();
      },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not record the approval action.'); }
    });
  }

  loadApprovalHistory(): void {
    this.approvalService.getHistory(this.moduleCode, this.code).subscribe({
      next: tables => this.approvalHistory.set(tables ?? []),
      error: () => this.errorMessage.set('Could not load approval history.')
    });
  }

  updateApprovalComment(value: string): void {
    this.approvalComment.set(value);
  }

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  // ---------- Save / Delete ----------
  async save(): Promise<void> {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    if (this.isApproved()) {
      this.errorMessage.set('This record has been Approved and cannot be updated.');
      return;
    }
    if (this.form.get('vehicleCode')?.invalid || !this.form.get('vehicleCode')?.value) {
      this.errorMessage.set('Please choose a vehicle.');
      return;
    }
    if (this.form.get('docDate')?.invalid) {
      this.errorMessage.set('Please choose a date.');
      return;
    }

    if (!this.isNew) {
      this.approvalService.verify(FORM_CLASS_NAME, this.code).subscribe({
        next: async ({ count }) => {
          if (count > 0) {
            if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
            this.approvalService.clearActions(FORM_CLASS_NAME, this.code, this.moduleCode).subscribe({
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

    const payload = {
      code: this.code,
      docNo: this.toText(v.docNo),
      docDate: v.docDate,
      vehicleCode: this.toNumber(v.vehicleCode),
      branchCode: this.toNumber(v.branchCode),
      driverCode: this.toNumber(v.driverCode) || 0,
      serviceType: v.serviceType,
      currentKM: this.toNumber(v.currentKM),
      nextServiceKM: this.toNumber(v.nextServiceKM),
      serviceDate: v.serviceDate || null,
      nextServiceDueDate: v.nextServiceDueDate || null,
      remarks: this.toText(v.remarks),
      active: !!v.active,
      statusCode: this.toNumber(v.statusCode) || 1,
      completedDate: v.completedDate || null,
      vatAmount: this.itemsVatTotal,
      totalAmount: this.itemsTotalWithVat,
      discountAmount: this.toNumber(v.discountAmount),
      netAmount: this.netAmount,
      items: this.items.getRawValue()
        // Keep any row the user actually put data into, not just rows with a Description -
        // a row where only Qty/Rate/Remarks got filled in (Description still blank, mid-edit)
        // was previously dropped here silently on every save, which is how a row with real
        // data (e.g. Rate typed in) could vanish entirely after an update.
        .filter((r: any) => this.toText(r.description).trim() !== '' || this.toNumber(r.rate) !== 0 || this.toText(r.remarks).trim() !== '')
        .map((r: any) => ({
          slNo: this.toNumber(r.slNo),
          description: this.toText(r.description),
          qty: this.toNumber(r.qty),
          rate: this.toNumber(r.rate),
          amount: this.toNumber(r.amount),
          vatPercent: this.toNumber(r.vatPercent),
          vatAmount: this.toNumber(r.vatAmount),
          statusCode: this.toNumber(r.statusCode) || 1,
          remarks: this.toText(r.remarks),
          parts: this.toText(r.parts) || null
        })),
      documents: this.documents.getRawValue()
        .filter((r: any) => this.toText(r.description).trim() !== '')
        .map((r: any) => ({
          slNo: this.toNumber(r.slNo),
          description: this.toText(r.description),
          remarks: this.toText(r.remarks),
          docUpload: this.toText(r.docUpload) || null
        }))
    };

    this.service.save(payload, this.settings.periodId()).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.confirmDialog.notify(res?.result || (wasNew ? 'Saved Successfully' : 'Updated Successfully'));
        this.router.navigate(['/vehicle-service-repair']);
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

    if (!this.moduleCode) {
      this.performDelete();
      return;
    }

    this.approvalService.getStatus(this.moduleCode, this.code).subscribe({
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
    this.approvalService.verify(FORM_CLASS_NAME, this.code).subscribe({
      next: async ({ count }) => {
        if (count > 0) {
          if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
          this.approvalService.clearActions(FORM_CLASS_NAME, this.code, this.moduleCode).subscribe({
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
    this.service.delete(this.code, this.settings.periodId()).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.router.navigate(['/vehicle-service-repair']);
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not delete the record.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/vehicle-service-repair']);
  }

  print(): void {
    const a = document.createElement('a');
    a.href = `/vehicle-service-repair/${this.code}/print`;
    a.target = '_blank';
    a.click();
  }

  // ---------- Helpers ----------
  private nextSlNo(rows: FormArray): number {
    return rows.length === 0 ? 1 : Math.max(...rows.controls.map(r => this.toNumber(r.get('slNo')?.value))) + 1;
  }

  private removeRowBySlNo(rows: FormArray, slNo: unknown): void {
    const index = rows.controls.findIndex(r => String(r.get('slNo')?.value) === String(slNo));
    if (index >= 0) rows.removeAt(index);
  }

  private responseArray(response: any, ...keys: string[]): any[] {
    for (const key of keys) {
      const value = this.read(response, key);
      if (Array.isArray(value)) return value;
    }
    return [];
  }

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

  private toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private toText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
