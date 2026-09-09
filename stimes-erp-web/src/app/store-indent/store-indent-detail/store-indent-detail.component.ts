import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { StoreIndentService } from '../services/store-indent.service';
import { SettingsService } from '../../core/services/settings.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { FilterSelectComponent } from '../../shared/filter-select/filter-select.component';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

type TabKey = 'basic' | 'general' | 'material' | 'consumable' | 'tae' | 'approval';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Purchase.StoreIndent';

@Component({
  selector: 'app-store-indent-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FilterSelectComponent],
  templateUrl: './store-indent-detail.component.html',
  styleUrl: './store-indent-detail.component.scss'
})
export class StoreIndentDetailComponent implements OnInit {
  id = 0;
  isNew = true;
  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  costCenters = signal<any[]>([]);
  units = signal<any[]>([]);
  salesOrders = signal<any[]>([]);
  users = signal<any[]>([]);
  employees = signal<any[]>([]);
  requestedStatuses = signal<any[]>([]);

  // General grid's Type-driven item lookup, cached per TypeCode (1 Material / 2 Consumable / 3 T&E).
  private generalItemLookupCache = new Map<number, any[]>();
  generalItemOptions = signal<any[]>([]);

  activeTab = signal<TabKey>('basic');

  // Approval workflow (Lock/Approve/Deny) - matches ISApprove_userandform / FillActions in the desktop app.
  approvalEnabled = signal(false);
  moduleCode = 0;
  approvalVisible = signal(false);
  approvalAction = signal<any>(null);
  approvalHistory = signal<any[][] | null>(null);
  approvalComment = signal('');
  approvalBusy = signal(false);

  // Matches desktop's CheckPermission() (myUserRights.ADD/DELETE).
  rights = signal<UserRights>(NO_RIGHTS);

  form!: FormGroup;

  get general(): FormArray { return this.form.get('general') as FormArray; }
  get material(): FormArray { return this.form.get('material') as FormArray; }
  get consumable(): FormArray { return this.form.get('consumable') as FormArray; }
  get tae(): FormArray { return this.form.get('tae') as FormArray; }

  // Plain methods, not computed() signals: they read FormControl.value, which is not a signal,
  // so a computed() here would read zero signal dependencies and freeze at its first-ever result
  // instead of updating when the Type/Sub Type radios change the form value.
  isProjectMode(): boolean { return this.form?.get('requisitionType')?.value === 'PRO'; }
  isInhouseSubType(): boolean { return this.form?.get('requisitionSubType')?.value === 'INH'; }

  tabs(): { key: TabKey; label: string }[] {
    const list: { key: TabKey; label: string }[] = [{ key: 'basic', label: 'Basic Details' }];
    if (!this.isProjectMode()) {
      list.push({ key: 'general', label: 'General' });
    } else {
      list.push({ key: 'material', label: 'Materials' }, { key: 'consumable', label: 'Consumable' }, { key: 'tae', label: 'Tools and Equipment' });
    }
    if (this.approvalEnabled()) list.push({ key: 'approval', label: 'Approval' });
    return list;
  }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private storeIndentService: StoreIndentService,
    private approvalService: ApprovalService,
    private userRightsService: UserRightsService,
    public settings: SettingsService,
    private confirmDialog: ConfirmDialogService
  ) {
    this.form = this.fb.group({
      requisitionNo: [{ value: '', disabled: true }],
      requisitionDate: ['', Validators.required],
      active: [true],
      costId: [null],
      requisitionType: ['GEN'],
      requisitionSubType: ['OTH'],
      jobCode: [null],
      requisitionDetails: [''],
      refNo: [''],
      employeeCode: [null],
      designation: [''],
      requestedStatus: [null],
      createdByECode: [null],
      checkedByECode: [null],
      approvedByECode: [null],
      general: this.fb.array([]),
      material: this.fb.array([]),
      consumable: this.fb.array([]),
      tae: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.isNew = this.id === 0;

    this.loadLookups();
    this.loadApprovalSettings();
    this.loadRights();

    if (this.isNew) {
      this.storeIndentService.generateDocNo(this.settings.periodId()).subscribe(res => {
        this.form.patchValue({ requisitionNo: res.docNo, requisitionDate: this.today() });
      });
      this.refreshProjectGrids(0);
      this.addGeneralRow();
    } else {
      this.loadExisting();
    }
  }

  private today(): string {
    return new Date().toISOString().substring(0, 10);
  }

  private loadLookups(): void {
    this.storeIndentService.getLookups(this.settings.branchCode()).subscribe({
      next: lookups => {
        this.costCenters.set(lookups.costCenters ?? []);
        this.units.set(lookups.units ?? []);
        this.salesOrders.set(lookups.salesOrders ?? []);
        this.users.set(lookups.users ?? []);
        this.employees.set(lookups.employees ?? []);
        this.requestedStatuses.set(lookups.requestedStatuses ?? []);
      },
      error: () => this.errorMessage.set('Could not load Store Indent dropdown data.')
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
    this.approvalService.getStatus(this.moduleCode, this.id).subscribe({
      next: status => {
        this.approvalVisible.set(status.visible);
        this.approvalAction.set(status.action ?? null);
      },
      error: () => {}
    });
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => this.rights.set(rights),
      error: () => this.rights.set(NO_RIGHTS)
    });
  }

  // Matches desktop's FillActions: SaveButton.IsEnabled is forced false once CurrentStatus == "A",
  // on top of the myUserRights.ADD permission check from CheckPermission().
  isApproved(): boolean {
    return this.read(this.approvalAction(), 'CurrentStatus') === 'A';
  }

  canSave(): boolean {
    return this.rights().add && !this.isApproved();
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.storeIndentService.getById(this.id, this.settings.branchCode()).subscribe({
      next: (res) => {
        const hdr = this.firstRecord(res, 'Header', 'header');
        const requisitionType = this.read(hdr, 'RequestedType', 'RequisitionType') === 'PRO' ? 'PRO' : 'GEN';
        const requisitionSubType = this.read(hdr, 'RequestedSubType') === 'INH' ? 'INH' : 'OTH';
        const jobCode = this.toNumber(this.read(hdr, 'JobCode'));

        this.form.patchValue({
          requisitionNo: this.read(hdr, 'PurReqnNo'),
          requisitionDate: this.toDateInputValue(this.read(hdr, 'PReqnDate')),
          active: this.read(hdr, 'ActiveYesNo') !== 'N',
          costId: this.read(hdr, 'CostId'),
          requisitionType,
          requisitionSubType,
          jobCode: jobCode || null,
          requisitionDetails: this.read(hdr, 'PurReqnDetails', 'ReqnDetails'),
          refNo: this.read(hdr, 'PReqnRefNo'),
          employeeCode: this.read(hdr, 'EmployeeCode'),
          designation: this.read(hdr, 'Designation'),
          requestedStatus: this.read(hdr, 'RequestedStatus'),
          createdByECode: this.read(hdr, 'CreatedByECode'),
          checkedByECode: this.read(hdr, 'CheckedByECode'),
          approvedByECode: this.read(hdr, 'ApprovedByECode')
        });

        this.responseArray(res, 'General', 'general').forEach((r: any) => this.addGeneralRow(r));
        this.responseArray(res, 'Material', 'material').forEach((r: any) => this.addItemRow(this.material, r));
        this.responseArray(res, 'Consumable', 'consumable').forEach((r: any) => this.addItemRow(this.consumable, r));
        this.responseArray(res, 'TAE', 'tae').forEach((r: any) => this.addItemRow(this.tae, r));
        if (this.general.length === 0) this.addGeneralRow();

        if (this.approvalEnabled()) this.loadApprovalStatus();
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load record.'); this.loading.set(false); }
    });
  }

  // Sales Order No / Employee are both app-filter-select bound directly to their code
  // FormControls now, so the matching option's label is resolved and shown automatically - no
  // separate display-name lookup needed for either.

  // ---------- Type radio (General / Project) ----------
  onRequisitionTypeChanged(value: string): void {
    this.form.patchValue({ requisitionType: value, requisitionSubType: 'OTH' });
    this.activeTab.set(value === 'PRO' ? 'material' : 'general');
    if (value === 'PRO') {
      const jobCode = this.toNumber(this.form.get('jobCode')?.value);
      this.refreshProjectGrids(jobCode);
    }
  }

  onRequisitionSubTypeChanged(value: string): void {
    this.form.patchValue({ requisitionSubType: value });
  }

  // ---------- Sales Order (Project mode auto-fill; inert in General mode, matching desktop's
  // txtJobDet_SelectionChanged, which only acts when rdbGeneral.IsChecked == false).
  // formControlName="jobCode" has already synced the FormControl by the time this runs -
  // Angular always resolves a directive's own value-accessor listener before a template (change)
  // listener bound to the same element/event. ----------
  onSalesOrderChanged(): void {
    if (!this.isProjectMode()) return;

    const jobCode = this.toNumber(this.form.get('jobCode')?.value);
    if (!jobCode) return;

    const so = this.findSalesOrderByCode(jobCode);
    if (!so) return;

    this.form.patchValue({ requisitionDetails: this.read(so, 'ProjectOrLocation') }, { emitEvent: false });
    this.refreshProjectGrids(jobCode);
  }

  private findSalesOrderByCode(code: unknown): any {
    return this.salesOrders().find(item => String(this.read(item, 'SOCode')) === String(code));
  }

  private refreshProjectGrids(soCode: number): void {
    this.storeIndentService.getSalesOrderEstimation(soCode, this.settings.periodId()).subscribe({
      next: res => {
        this.material.clear();
        this.consumable.clear();
        this.tae.clear();
        (res.Material ?? []).forEach((r: any) => this.addItemRow(this.material, r));
        (res.Consumable ?? []).forEach((r: any) => this.addItemRow(this.consumable, r));
        (res.TAE ?? []).forEach((r: any) => this.addItemRow(this.tae, r));
      },
      error: () => this.errorMessage.set('Could not load sales order estimation details.')
    });
  }

  // ---------- Employee (Inhouse subtype) ----------
  onEmployeeChanged(employeeCode: number | null): void {
    if (!employeeCode) return;
    this.storeIndentService.getEmployeeDesignation(employeeCode).subscribe({
      next: res => this.form.patchValue({ designation: res.designation }, { emitEvent: false })
    });
  }

  // ---------- General grid ----------
  addGeneralRow(data?: any): void {
    this.general.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.general)],
      typeCode: [this.read(data, 'TypeCode') ?? null],
      statusCode: [this.read(data, 'StatusCode') ?? 2],
      itemCode: [this.read(data, 'ItemCode') ?? null],
      itemName: [this.read(data, 'Description') ?? ''],
      descriptionNew: [this.read(data, 'DescriptionNew') ?? ''],
      unitCode: [this.read(data, 'UnitCode') ?? null],
      unitName: [this.read(data, 'UnitDesc') ?? ''],
      stockQty: [{ value: this.read(data, 'StockQty') ?? 0, disabled: true }],
      requestedQty: [this.read(data, 'RequestedQty') ?? 0],
      issuedQty: [this.read(data, 'IssuedQty') ?? 0],
      remarks: [this.read(data, 'Remarks') ?? '']
    }));
  }

  removeGeneralRow(slNo: unknown): void { this.removeRowBySlNo(this.general, slNo); }

  onGeneralStatusChanged(index: number): void {
    const row = this.general.at(index);
    // Status 1 = New (free-text item name); Status 2 = Exist (picked from master list).
    if (this.toNumber(row.get('statusCode')?.value) === 1) {
      row.patchValue({ itemCode: null, itemName: '' }, { emitEvent: false });
    }
  }

  onGeneralTypeChanged(index: number): void {
    const row = this.general.at(index);
    const typeCode = this.toNumber(row.get('typeCode')?.value);
    row.patchValue({ itemCode: null, itemName: '', unitCode: null, unitName: '', stockQty: 0 }, { emitEvent: false });
    this.loadGeneralItemOptions(typeCode);
  }

  loadGeneralItemOptions(typeCode: number): void {
    const cached = this.generalItemLookupCache.get(typeCode);
    if (cached) { this.generalItemOptions.set(cached); return; }
    if (!typeCode || typeCode === 4) { this.generalItemOptions.set([]); return; }

    this.storeIndentService.getItemLookup(typeCode).subscribe({
      next: items => {
        this.generalItemLookupCache.set(typeCode, items ?? []);
        this.generalItemOptions.set(items ?? []);
      },
      error: () => this.generalItemOptions.set([])
    });
  }

  onGeneralItemChanged(index: number, value: string): void {
    const row = this.general.at(index);
    const typeCode = this.toNumber(row.get('typeCode')?.value);
    const options = this.generalItemLookupCache.get(typeCode) ?? [];
    const item = options.find(entry => String(this.read(entry, 'Description')).trim().toLowerCase() === value.trim().toLowerCase());

    if (!item) {
      row.patchValue({ itemName: value, itemCode: null }, { emitEvent: false });
      return;
    }

    const itemCode = this.toNumber(this.read(item, 'ItemCode'));

    // Duplicate check within the grid - same Item + Type already entered (matches desktop's warning).
    const duplicate = this.general.controls.some((other, otherIndex) =>
      otherIndex !== index &&
      this.toNumber(other.get('itemCode')?.value) === itemCode &&
      this.toNumber(other.get('typeCode')?.value) === typeCode);

    if (duplicate) {
      this.errorMessage.set('Item Already Entered');
      row.patchValue({ itemCode: null, itemName: '', unitCode: null, stockQty: 0 }, { emitEvent: false });
      return;
    }

    row.patchValue({ itemCode, itemName: this.read(item, 'Description') }, { emitEvent: false });

    this.storeIndentService.getItemSpec(itemCode, typeCode, this.settings.periodId()).subscribe({
      next: spec => {
        if (!spec) return;
        row.patchValue({
          unitCode: this.read(spec, 'UnitCode'),
          stockQty: this.toNumber(this.read(spec, 'StockQty'))
        }, { emitEvent: false });
      }
    });
  }

  // ---------- Material / Consumable / Tools & Equipment (Project mode) ----------
  addItemRow(rows: FormArray, data?: any): void {
    rows.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(rows)],
      itemCode: [this.read(data, 'ItemCode', 'ConsumableCode', 'ToolsAndEquipmentCode') ?? null],
      itemName: [this.read(data, 'Specification', 'Description') ?? ''],
      unitCode: [this.read(data, 'UnitCode') ?? null],
      unitName: [this.read(data, 'UnitDesc') ?? ''],
      stockQty: [{ value: this.read(data, 'StockQty') ?? 0, disabled: true }],
      requestedQty: [this.read(data, 'RequestedQty') ?? 0],
      issuedQty: [this.read(data, 'IssuedQty') ?? 0],
      remarks: [this.read(data, 'Remarks') ?? '']
    }));
  }

  removeItemRow(rows: FormArray, slNo: unknown): void { this.removeRowBySlNo(rows, slNo); }

  // ---------- Approval workflow ----------
  async toggleLock(): Promise<void> {
    if (this.isNew) return;
    const locked = this.read(this.approvalAction(), 'IsLocked') === 'L';
    const confirmMsg = locked ? 'Are you sure to Unlock the Requisition ?' : 'Are you sure to Lock the Requisition ?';
    if (!(await this.confirmDialog.confirm(confirmMsg))) return;

    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.id, 'L', locked ? 'U' : 'L', this.approvalComment()).subscribe({
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
    this.approvalService.manageAction(this.moduleCode, this.id, 'A', action, this.approvalComment()).subscribe({
      next: () => {
        this.approvalBusy.set(false);
        this.confirmDialog.notify(successMessage);
        this.loadApprovalStatus();
      },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not record the approval action.'); }
    });
  }

  loadApprovalHistory(): void {
    this.approvalService.getHistory(this.moduleCode, this.id).subscribe({
      next: tables => this.approvalHistory.set(tables ?? []),
      error: () => this.errorMessage.set('Could not load approval history.')
    });
  }

  updateApprovalComment(value: string): void {
    this.approvalComment.set(value);
  }

  // ---------- Save / Delete ----------
  async save(): Promise<void> {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    if (this.isApproved()) {
      this.errorMessage.set('This requisition has been Approved and cannot be updated.');
      return;
    }
    if (this.form.get('requisitionDate')?.invalid) {
      this.form.markAllAsTouched();
      this.activeTab.set('basic');
      return;
    }

    if (!this.isNew) {
      this.approvalService.verify(FORM_CLASS_NAME, this.id).subscribe({
        next: async ({ count }) => {
          if (count > 0) {
            if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
            this.approvalService.clearActions(FORM_CLASS_NAME, this.id, this.moduleCode).subscribe({
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
      pReqnCode: this.id,
      requisitionNo: this.toText(v.requisitionNo),
      requisitionDetails: this.toText(v.requisitionDetails),
      requisitionDate: v.requisitionDate,
      refNo: this.toText(v.refNo),
      supplierCode: 0,
      jobCode: this.toNumber(v.jobCode),
      active: !!v.active,
      costId: this.toNumber(v.costId),
      createdByECode: this.toNumber(v.createdByECode),
      checkedByECode: this.toNumber(v.checkedByECode),
      approvedByECode: this.toNumber(v.approvedByECode),
      requisitionType: v.requisitionType,
      requisitionSubType: v.requisitionSubType,
      employeeCode: this.toNumber(v.employeeCode),
      designation: this.toText(v.designation),
      requestedStatus: this.toNumber(v.requestedStatus),
      general: this.general.getRawValue().map((row: any) => ({
        slNo: this.toNumber(row.slNo),
        typeCode: this.toNumber(row.typeCode),
        statusCode: this.toNumber(row.statusCode),
        itemCode: this.toNumber(row.itemCode),
        description: this.toText(row.itemName),
        descriptionNew: this.toText(row.descriptionNew),
        unitCode: this.toNumber(row.unitCode),
        stockQty: this.toNumber(row.stockQty),
        requestedQty: this.toNumber(row.requestedQty),
        issuedQty: this.toNumber(row.issuedQty),
        remarks: this.toText(row.remarks)
      })),
      material: this.mapItemRows(this.material),
      consumable: this.mapItemRows(this.consumable),
      tae: this.mapItemRows(this.tae)
    };

    this.storeIndentService.save(payload, this.settings.companyCode(), this.settings.branchCode(), this.settings.periodId()).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        const success = typeof res?.result === 'string' && res.result.trim().toLowerCase() === 'data saved';
        this.confirmDialog.notify(res?.result || (wasNew ? 'Saved Successfully' : 'Updated Successfully'));
        if (success || wasNew) this.router.navigate(['/store-indent']);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(this.readSaveError(err));
      }
    });
  }

  private mapItemRows(rows: FormArray): any[] {
    return rows.getRawValue().map((row: any) => ({
      slNo: this.toNumber(row.slNo),
      itemCode: this.toNumber(row.itemCode),
      unitCode: this.toNumber(row.unitCode),
      stockQty: this.toNumber(row.stockQty),
      requestedQty: this.toNumber(row.requestedQty),
      issuedQty: this.toNumber(row.issuedQty),
      remarks: this.toText(row.remarks)
    }));
  }

  cancel(): void {
    this.router.navigate(['/store-indent']);
  }

  // ---------- Helpers ----------
  private readSaveError(err: any): string {
    const errors = err?.error?.errors;
    if (errors && typeof errors === 'object') {
      const messages = Object.values(errors).flat().filter(Boolean);
      if (messages.length) return messages.join(' ');
    }
    return err?.error?.title || err?.error?.message || 'Save failed. Check the API console for details.';
  }

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  rowValue(record: any, key: string): any {
    return this.read(record, key);
  }

  read(record: any, ...keys: string[]): any {
    for (const key of keys) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (record?.[key] !== undefined) return record[key];
      if (record?.[camelKey] !== undefined) return record[camelKey];
    }
    return undefined;
  }


  private firstRecord(response: any, ...keys: string[]): any {
    for (const key of keys) {
      const value = this.read(response, key);
      if (Array.isArray(value) && value.length > 0) return value[0];
    }
    return {};
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

  private nextSlNo(rows: FormArray): number {
    return rows.controls.reduce((max, row) => Math.max(max, this.toNumber(row.get('slNo')?.value)), 0) + 1;
  }

  private renumberRows(rows: FormArray): void {
    rows.controls.forEach((row, index) => row.get('slNo')?.setValue(index + 1, { emitEvent: false }));
  }

  private removeRowBySlNo(rows: FormArray, slNo: unknown): void {
    const index = rows.controls.findIndex(row => String(row.get('slNo')?.value) === String(slNo));
    if (index >= 0) {
      rows.removeAt(index);
      this.renumberRows(rows);
    }
  }

  private toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private toText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }
}
