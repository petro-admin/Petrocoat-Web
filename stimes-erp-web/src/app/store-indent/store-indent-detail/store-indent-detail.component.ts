import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { StoreIndentService } from '../services/store-indent.service';
import { SettingsService } from '../../core/services/settings.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { DateInputComponent } from '../../shared/date-input/date-input.component';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

type TabKey = 'basic' | 'general' | 'material' | 'consumable' | 'tae' | 'approval';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Purchase.StoreIndent';

@Component({
  selector: 'app-store-indent-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DateInputComponent],
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
  rightsLoaded = signal(false);

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
      costName: [''],
      requisitionType: ['GEN'],
      requisitionSubType: ['OTH'],
      jobCode: [null],
      jobNo: [''],
      requisitionDetails: [''],
      refNo: [''],
      employeeCode: [null],
      employeeName: [''],
      designation: [''],
      requestedStatus: [null],
      requestedStatusName: [''],
      createdByECode: [null],
      createdByName: [''],
      checkedByECode: [null],
      checkedByName: [''],
      approvedByECode: [null],
      approvedByName: [''],
      general: this.fb.array([]),
      material: this.fb.array([]),
      consumable: this.fb.array([]),
      tae: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.isNew = this.id === 0;

    this.loadApprovalSettings();
    this.loadRights();

    // Lookups (units + Material/Consumable/TAE code->description lists) have to be in hand
    // before any grid row is created - the SO-estimation SPs only return codes, not names, so
    // addItemRow resolves the display text from these caches at creation time.
    this.loadLookups(() => {
      if (this.isNew) {
        this.storeIndentService.generateDocNo(this.settings.periodId()).subscribe(res => {
          this.form.patchValue({ requisitionNo: res.docNo, requisitionDate: this.today() });
        });
        this.refreshProjectGrids(0);
        this.addGeneralRow();
      } else {
        this.loadExisting();
      }
    });
  }

  // Matches desktop's Init(): txtRequisitionDate.SelectedDate = Convert.ToDateTime(ProcessingDate) -
  // the new record's Requisition Date defaults from Processing Date, not the browser's system date.
  private today(): string {
    const processingDate = this.settings.processingDate() ?? new Date();
    return processingDate.toISOString().substring(0, 10);
  }

  private loadLookups(callback?: () => void): void {
    forkJoin({
      lookups: this.storeIndentService.getLookups(this.settings.branchCode()),
      material: this.storeIndentService.getItemLookup(1),
      consumable: this.storeIndentService.getItemLookup(2),
      tae: this.storeIndentService.getItemLookup(3)
    }).subscribe({
      next: ({ lookups, material, consumable, tae }) => {
        this.costCenters.set(lookups.costCenters ?? []);
        this.units.set(lookups.units ?? []);
        this.salesOrders.set(lookups.salesOrders ?? []);
        this.users.set(lookups.users ?? []);
        this.employees.set(lookups.employees ?? []);
        this.requestedStatuses.set(lookups.requestedStatuses ?? []);
        // Pre-warms the same cache loadGeneralItemOptions() reads from, so both the General
        // grid's item picker and Material/Consumable/TAE's SO-estimation name resolution
        // (addItemRow) share one fetch instead of duplicating it.
        this.generalItemLookupCache.set(1, material ?? []);
        this.generalItemLookupCache.set(2, consumable ?? []);
        this.generalItemLookupCache.set(3, tae ?? []);
        callback?.();
      },
      error: () => { this.errorMessage.set('Could not load Indent dropdown data.'); callback?.(); }
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
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
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

        const costId = this.toNumber(this.read(hdr, 'CostId')) || null;
        const employeeCode = this.toNumber(this.read(hdr, 'EmployeeCode')) || null;
        const requestedStatus = this.toNumber(this.read(hdr, 'RequestedStatus')) || null;
        const createdByECode = this.toNumber(this.read(hdr, 'CreatedByECode')) || null;
        const checkedByECode = this.toNumber(this.read(hdr, 'CheckedByECode')) || null;
        const approvedByECode = this.toNumber(this.read(hdr, 'ApprovedByECode')) || null;
        const so = jobCode ? this.findSalesOrderByCode(jobCode) : null;

        this.form.patchValue({
          requisitionNo: this.read(hdr, 'PurReqnNo'),
          requisitionDate: this.toDateInputValue(this.read(hdr, 'PReqnDate')),
          active: this.read(hdr, 'ActiveYesNo') !== 'N',
          costId,
          costName: this.resolveName(this.costCenters(), costId, 'CostId', 'CostName'),
          requisitionType,
          requisitionSubType,
          jobCode: jobCode || null,
          jobNo: so ? this.read(so, 'SONo') : '',
          requisitionDetails: this.read(hdr, 'PurReqnDetails', 'ReqnDetails'),
          refNo: this.read(hdr, 'PReqnRefNo'),
          employeeCode,
          employeeName: this.resolveName(this.employees(), employeeCode, 'EmployeeCode', 'EmpFullName'),
          designation: this.read(hdr, 'Designation'),
          requestedStatus,
          requestedStatusName: this.resolveName(this.requestedStatuses(), requestedStatus, 'StatusCode', 'StatusName'),
          createdByECode,
          createdByName: this.resolveName(this.users(), createdByECode, 'UserCode', 'UserName'),
          checkedByECode,
          checkedByName: this.resolveName(this.users(), checkedByECode, 'UserCode', 'UserName'),
          approvedByECode,
          approvedByName: this.resolveName(this.users(), approvedByECode, 'UserCode', 'UserName')
        });

        this.responseArray(res, 'General', 'general').forEach((r: any) => this.addGeneralRow(r));
        this.responseArray(res, 'Material', 'material').forEach((r: any) => this.addItemRow(this.material, 1, r));
        this.responseArray(res, 'Consumable', 'consumable').forEach((r: any) => this.addItemRow(this.consumable, 2, r));
        this.responseArray(res, 'TAE', 'tae').forEach((r: any) => this.addItemRow(this.tae, 3, r));
        if (this.general.length === 0) this.addGeneralRow();

        if (this.approvalEnabled()) this.loadApprovalStatus();
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load record.'); this.loading.set(false); }
    });
  }

  // ---------- Generic header lookup fields (Cost Center, Employee, Requested Status,
  // Created/Checked/Approved By) - native <input list>/<datalist> pair matching Daily Site's
  // onLookupTextChanged pattern exactly, instead of the app-filter-select widget.
  onLookupTextChanged(nameControl: string, codeControl: string, value: string, items: any[], codeKey: string, nameKey: string): void {
    const normalizedValue = value.trim().toLowerCase();
    const item = items.find(entry => String(this.read(entry, nameKey) ?? '').trim().toLowerCase() === normalizedValue);
    const code = item ? Number(this.read(item, codeKey)) : null;
    this.form.patchValue({
      [nameControl]: item ? this.read(item, nameKey) : value,
      [codeControl]: code
    }, { emitEvent: false });

    if (item && codeControl === 'employeeCode') this.onEmployeeChanged(code);
  }

  private resolveName(items: any[], code: number | null, codeKey: string, nameKey: string): string {
    if (!code) return '';
    const match = items.find(entry => this.toNumber(this.read(entry, codeKey)) === code);
    return match ? this.toText(this.read(match, nameKey)) : '';
  }

  // ---------- Type radio (General / Project) ----------
  // Matches desktop's rdbType_Click: only toggles which tabs are visible (Material/Consumable/TAE
  // vs General) - it does not change the currently selected tab, so this stays on whichever tab
  // you're already on (typically Basic Details, where these radios live).
  onRequisitionTypeChanged(value: string): void {
    this.form.patchValue({ requisitionType: value, requisitionSubType: 'OTH' });
    if (value === 'PRO') {
      const jobCode = this.toNumber(this.form.get('jobCode')?.value);
      this.refreshProjectGrids(jobCode);
    }
  }

  onRequisitionSubTypeChanged(value: string): void {
    this.form.patchValue({ requisitionSubType: value });
  }

  // ---------- Sales Order - native <input list>/<datalist>. A native datalist's (change) event
  // is not reliable when a suggestion is picked with the mouse (see filter-select.component.ts's
  // own comment on exactly this) - a plain (input) always fires on every value change though, so
  // the full cascade (jobNo normalization + Project-mode auto-fill, matching desktop's
  // txtJobDet_SelectionChanged) runs from there as soon as a full match exists, not just from
  // (change). (change) still calls the same logic too, as a harmless redundant safety net.
  onSalesOrderTextChanged(value: string): void {
    this.applySalesOrderMatch(value);
  }

  onSalesOrderSelected(value: string): void {
    this.applySalesOrderMatch(value);
  }

  private applySalesOrderMatch(value: string): void {
    const order = this.findSalesOrderByName(value);
    const jobCode = order ? Number(this.read(order, 'SOCode')) : null;
    const previousJobCode = this.toNumber(this.form.get('jobCode')?.value) || null;

    this.form.patchValue({
      jobCode,
      jobNo: order ? this.read(order, 'SONo') : this.form.get('jobNo')?.value
    }, { emitEvent: false });

    if (order && jobCode && this.isProjectMode() && jobCode !== previousJobCode) {
      this.form.patchValue({ requisitionDetails: this.read(order, 'ProjectOrLocation') }, { emitEvent: false });
      this.refreshProjectGrids(jobCode);
    }
  }

  private findSalesOrderByName(value: string): any {
    const normalized = value.trim().toLowerCase();
    return this.salesOrders().find(item => String(this.read(item, 'SONo')).trim().toLowerCase() === normalized);
  }

  private findSalesOrderByCode(code: unknown): any {
    return this.salesOrders().find(item => String(this.read(item, 'SOCode')) === String(code));
  }

  private refreshProjectGrids(soCode: number): void {
    // Matches Daily Site's loadSalesOrderDetails: the same loading-overlay + disabled-tabs
    // treatment while the Sales Order's Material/Consumable/TAE estimation is being fetched.
    this.loading.set(true);
    this.storeIndentService.getSalesOrderEstimation(soCode, this.settings.periodId()).subscribe({
      next: res => {
        this.material.clear();
        this.consumable.clear();
        this.tae.clear();
        // res.Material/Consumable/TAE was reading PascalCase, but ASP.NET Core serializes JSON as
        // camelCase by default - this always came back undefined, silently leaving all three grids
        // empty. responseArray tries both casings, same fix loadExisting() already relies on.
        this.responseArray(res, 'Material', 'material').forEach((r: any) => this.addItemRow(this.material, 1, r));
        this.responseArray(res, 'Consumable', 'consumable').forEach((r: any) => this.addItemRow(this.consumable, 2, r));
        this.responseArray(res, 'TAE', 'tae').forEach((r: any) => this.addItemRow(this.tae, 3, r));
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load sales order estimation details.'); this.loading.set(false); }
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
    const unitCode = this.toNumber(this.read(data, 'UnitCode')) || null;
    this.general.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.general)],
      typeCode: [this.read(data, 'TypeCode') ?? null],
      statusCode: [this.read(data, 'StatusCode') ?? 2],
      itemCode: [this.read(data, 'ItemCode') ?? null],
      itemName: [this.read(data, 'Description') ?? ''],
      descriptionNew: [this.read(data, 'DescriptionNew') ?? ''],
      unitCode: [unitCode],
      unitName: [this.toText(this.read(data, 'UnitDesc')) || this.resolveUnitName(unitCode)],
      stockQty: [{ value: this.read(data, 'StockQty') ?? 0, disabled: true }],
      requestedQty: [this.read(data, 'RequestedQty') ?? 0],
      issuedQty: [this.read(data, 'IssuedQty') ?? 0],
      remarks: [this.read(data, 'Remarks') ?? '']
    }));
  }

  // Matches desktop's gvGeneral_Deleting: "Are you sure delete this item" (Yes/No) before removing.
  async removeGeneralRow(slNo: unknown): Promise<void> {
    if (!(await this.confirmDialog.confirm('Are you sure delete this item ?'))) return;
    this.removeRowBySlNo(this.general, slNo);
    // Matches desktop's gvGeneral_Deleted: if the row that's now last is already filled in
    // (leftover from before the delete), keep one open blank row ready same as normal entry.
    this.maybeAppendBlankGeneralRow();
  }

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
    this.maybeAppendBlankGeneralRow();
  }

  onGeneralRequestedQtyChanged(): void {
    this.maybeAppendBlankGeneralRow();
  }

  // Matches desktop's gvGeneral_RowEditEnded: once the last row has a Type and a
  // RequestedQty > 0, a fresh blank row is appended automatically so there's always one open
  // row ready for the next entry, the same way desktop's grid behaves.
  private maybeAppendBlankGeneralRow(): void {
    const rows = this.general.controls;
    if (rows.length === 0) return;
    const last = rows[rows.length - 1];
    const typeCode = this.toNumber(last.get('typeCode')?.value);
    const requestedQty = this.toNumber(last.get('requestedQty')?.value);
    if (typeCode && requestedQty > 0) this.addGeneralRow();
  }

  loadGeneralItemOptions(typeCode: number): void {
    const cached = this.generalItemLookupCache.get(typeCode);
    if (cached) { this.generalItemOptions.set(cached); return; }
    if (!typeCode) { this.generalItemOptions.set([]); return; }

    this.storeIndentService.getItemLookup(typeCode, this.settings.branchCode()).subscribe({
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
        const unitCode = this.toNumber(this.read(spec, 'UnitCode')) || null;
        row.patchValue({
          unitCode,
          unitName: this.resolveUnitName(unitCode),
          stockQty: this.toNumber(this.read(spec, 'StockQty'))
        }, { emitEvent: false });
      }
    });
  }

  // ---------- Material / Consumable / Tools & Equipment (Project mode) ----------
  // usp_GetSalesOrderMaterialDetailsForStoreIndent/GetEstimationConsumableDetailsForStoreIndent/
  // GetEstimationTAEDetailsForStoreIndent only return ItemCode/UnitCode, never a description - same
  // as desktop, which resolves the display text through the grid's own item/unit master lookups
  // rather than the SP result. typeCode (1=Material/2=Consumable/3=TAE) picks which cached
  // ItemCode->Description list (see loadLookups/loadGeneralItemOptions) to resolve itemName from.
  addItemRow(rows: FormArray, typeCode: number, data?: any): void {
    const itemCode = this.toNumber(this.read(data, 'ItemCode', 'ConsumableCode', 'ToolsAndEquipmentCode')) || null;
    const unitCode = this.toNumber(this.read(data, 'UnitCode')) || null;
    const lookupItems = this.generalItemLookupCache.get(typeCode) ?? [];
    const matchedItem = itemCode ? lookupItems.find(i => this.toNumber(this.read(i, 'ItemCode')) === itemCode) : null;
    const itemName = this.toText(this.read(data, 'Specification', 'Description'))
      || (matchedItem ? this.toText(this.read(matchedItem, 'Description')) : '');
    const unitName = this.toText(this.read(data, 'UnitDesc')) || this.resolveUnitName(unitCode);
    // A row is Direct (manually added) if it's brand new in this session, or - once reloaded -
    // if the server persisted it as Direct via usp_Purchase_SetStoreIndentDirectFlags. Rows
    // pulled from the Sales Order estimation stay locked forever; a Direct row stays editable
    // even after reload, since it was never derived from the estimation to begin with.
    const isDirect = data ? this.read(data, 'IsDirect') === 'Y' : true;

    rows.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(rows)],
      itemCode: [itemCode],
      itemName: [{ value: itemName, disabled: !!data && !isDirect }],
      unitCode: [unitCode],
      unitName: [unitName],
      stockQty: [{ value: this.read(data, 'StockQty') ?? 0, disabled: true }],
      requestedQty: [this.read(data, 'RequestedQty') ?? 0],
      issuedQty: [this.read(data, 'IssuedQty') ?? 0],
      remarks: [this.read(data, 'Remarks') ?? ''],
      isDirect: [isDirect]
    }));
  }

  removeItemRow(rows: FormArray, slNo: unknown): void { this.removeRowBySlNo(rows, slNo); }

  // Matches Daily Site's Material/Consumable/Machineries color legend exactly, so "Direct" vs
  // "Estimation Wise" reads the same way across both forms.
  itemRowColor(row: AbstractControl): string {
    return row.get('isDirect')?.value ? '#DDEBF7' : '#FCE4D6';
  }

  // The cached ItemCode->Description lists (see loadLookups) exposed per tab for the "+ Add Row"
  // item picker's datalist - typeCode 1/2/3 match Material/Consumable/TAE respectively.
  materialItemOptions(): any[] { return this.generalItemLookupCache.get(1) ?? []; }
  consumableItemOptions(): any[] { return this.generalItemLookupCache.get(2) ?? []; }
  taeItemOptions(): any[] { return this.generalItemLookupCache.get(3) ?? []; }

  // Item picker for a manually-added Material/Consumable/TAE row (estimation rows have this
  // locked - see addItemRow). Mirrors onGeneralItemChanged's duplicate check and UnitCode/StockQty
  // spec lookup, scoped to this row's own fixed typeCode instead of a per-row Type dropdown.
  onItemRowNameChanged(rows: FormArray, index: number, typeCode: number, value: string): void {
    const row = rows.at(index);
    const options = this.generalItemLookupCache.get(typeCode) ?? [];
    const item = options.find(entry => String(this.read(entry, 'Description')).trim().toLowerCase() === value.trim().toLowerCase());

    if (!item) {
      row.patchValue({ itemName: value, itemCode: null }, { emitEvent: false });
      return;
    }

    const itemCode = this.toNumber(this.read(item, 'ItemCode'));
    const duplicate = rows.controls.some((other, otherIndex) =>
      otherIndex !== index && this.toNumber(other.get('itemCode')?.value) === itemCode);

    if (duplicate) {
      this.errorMessage.set('Item Already Entered');
      row.patchValue({ itemCode: null, itemName: '', unitCode: null, stockQty: 0 }, { emitEvent: false });
      return;
    }

    row.patchValue({ itemCode, itemName: this.read(item, 'Description') }, { emitEvent: false });

    this.storeIndentService.getItemSpec(itemCode, typeCode, this.settings.periodId()).subscribe({
      next: spec => {
        if (!spec) return;
        const unitCode = this.toNumber(this.read(spec, 'UnitCode')) || null;
        row.patchValue({
          unitCode,
          unitName: this.resolveUnitName(unitCode),
          stockQty: this.toNumber(this.read(spec, 'StockQty'))
        }, { emitEvent: false });
      }
    });
  }

  // Shared by the General/Material/Consumable/TAE grids' Uom column - native <input list>/<datalist>
  // matching Daily Site's row-level lookup pattern instead of app-filter-select.
  onUnitChanged(row: AbstractControl, value: string): void {
    const normalized = value.trim().toLowerCase();
    const unit = this.units().find(u => String(this.read(u, 'UnitDesc')).trim().toLowerCase() === normalized);
    row.patchValue({
      unitName: unit ? this.read(unit, 'UnitDesc') : value,
      unitCode: unit ? Number(this.read(unit, 'UnitCode')) : null
    }, { emitEvent: false });
  }

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
      remarks: this.toText(row.remarks),
      isDirect: !!row.isDirect
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

  private resolveUnitName(unitCode: number | null): string {
    if (!unitCode) return '';
    const match = this.units().find(u => this.toNumber(this.read(u, 'UnitCode')) === unitCode);
    return match ? this.toText(this.read(match, 'UnitDesc')) : '';
  }
}
