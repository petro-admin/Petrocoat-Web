import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DailySiteService } from '../services/daily-site.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

type TabKey = 'basic' | 'scope' | 'material' | 'manhours' | 'consumables' | 'machineries';

@Component({
  selector: 'app-daily-site-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './daily-site-detail.component.html',
  styleUrl: './daily-site-detail.component.scss'
})
export class DailySiteDetailComponent implements OnInit {
  id = 0;
  isNew = true;
  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);
  salesOrders = signal<any[]>([]);
  existingSalesOrders = signal<any[]>([]);
  scopePreparations = signal<any[]>([]);
  units = signal<any[]>([]);
  materials = signal<any[]>([]);
  employees = signal<any[]>([]);
  labourers = signal<any[]>([]);
  consumablesLookup = signal<any[]>([]);
  consumableStock = signal<any[]>([]);
  machineriesLookup = signal<any[]>([]);
  machineryStatuses = signal<any[]>([]);
  customers = signal<any[]>([]);
  activeTab = signal<TabKey>('basic');
  private expandedScopeGroups = new Set<string>();
  // Tracks the last combination of Today Consumed + Base Unit that passed the Received Qty check.
  // Both fields have to be reverted together - a Base Unit change can be what breaks the check even
  // though Today Consumed didn't change, so reverting Today Consumed alone would just keep failing
  // under the new Base Unit and loop the popup forever.
  private lastValidMaterialState = new WeakMap<AbstractControl, { todayConsumed: number; baseUnitCode: unknown }>();
  // Base units where the consumed contribution to Today Materials Used is TodayConsumed / PackSize
  // instead of TodayConsumed directly - all other units use TodayConsumed as-is.
  private readonly packSizeDivideUnitCodes = [6, 23, 35, 161, 171];

  tabs: { key: TabKey; label: string }[] = [
    { key: 'basic', label: 'Basic Details' },
    { key: 'scope', label: 'Scope of Work' },
    { key: 'material', label: 'Material' },
    { key: 'consumables', label: 'Consumables' },
    { key: 'machineries', label: 'Machineries' },
    { key: 'manhours', label: 'Manhours' }
  ];

  form!: FormGroup;

  get scopeOfWork(): FormArray { return this.form.get('scopeOfWork') as FormArray; }
  get material(): FormArray { return this.form.get('material') as FormArray; }
  get employeeHours(): FormArray { return this.form.get('employeeHours') as FormArray; }
  get consumables(): FormArray { return this.form.get('consumables') as FormArray; }
  get machineries(): FormArray { return this.form.get('machineries') as FormArray; }
  get branchHours(): FormArray { return this.form.get('branchHours') as FormArray; }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private dailySiteService: DailySiteService,
    private settings: SettingsService,
    private confirmDialog: ConfirmDialogService
  ) {
    this.form = this.fb.group({
      docNo: [{ value: '', disabled: true }],
      docDate: ['', Validators.required],
      jobNo: ['', Validators.required],
      jobCode: [null, Validators.required],
      existingJobNo: [''],
      existingJobCode: [null],
      division: [0],
      customer: ['', Validators.required],
      customerCode: [null],
      startDate: [''],
      finishDate: [''],
      location: [''],
      project: [''],
      startTime: [''],
      basicHrs: [0],
      supervisor: [''],
      supervisorName: [''],
      engineer: [''],
      engineerName: [''],
      materialsReceivedBy: [''],
      materialsReceivedByName: [''],
      withoutMaterial: [false],
      remarks: [''],

      scopeOfWork: this.fb.array([]),
      material: this.fb.array([]),
      employeeHours: this.fb.array([]),
      consumables: this.fb.array([]),
      machineries: this.fb.array([]),
      branchHours: this.fb.array([]),
      scopeManhours: [0],
      todayManhours: [{ value: 0, disabled: true }],
      todayManhoursPerc: [{ value: 0, disabled: true }],
      previousManhours: [{ value: 0, disabled: true }],
      previousManhoursPerc: [{ value: 0, disabled: true }],
      grandTotalManhours: [{ value: 0, disabled: true }],
      grandTotalManhoursPerc: [{ value: 0, disabled: true }],
      balanceManhours: [{ value: 0, disabled: true }],
      balanceManhoursPerc: [{ value: 0, disabled: true }],
      excess: [{ value: 0, disabled: true }],
      excessPerc: [{ value: 0, disabled: true }]
    });
  }

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.isNew = this.id === 0;

    if (this.isNew) {
      const today = new Date().toISOString().substring(0, 10);
      this.dailySiteService.generateDocNo(today).subscribe(res => {
        this.form.patchValue({ docNo: res.docNo, docDate: today });
      });
      this.loadSalesOrders();
    } else {
      this.loadExisting();
    }
    this.loadLookups();
  }

  private loadSalesOrders(): void {
    this.dailySiteService.getSalesOrders().subscribe({
      next: orders => this.salesOrders.set(orders ?? []),
      error: () => this.errorMessage.set('Could not load sales orders. Check the API connection.')
    });
  }

  private loadLookups(): void {
    this.dailySiteService.getLookups().subscribe({
      next: lookups => {
        this.scopePreparations.set(lookups.scopePreparations ?? []);
        this.units.set(lookups.units ?? []);
        this.materials.set(lookups.materials ?? []);
        this.employees.set(lookups.employees ?? []);
        this.labourers.set(lookups.labourers ?? []);
        this.consumablesLookup.set(lookups.consumables ?? []);
        this.consumableStock.set(lookups.consumableStock ?? []);
        this.machineriesLookup.set(lookups.machineries ?? []);
        this.machineryStatuses.set(lookups.machineryStatuses ?? []);
        this.customers.set(lookups.customers ?? []);
        this.resolveLookupNames();
      },
      error: () => this.errorMessage.set('Could not load Daily Site dropdown data.')
    });
  }

  onEmployeeSelected(index: number, value: string): void {
    const employee = this.employees().find(item => String(this.read(item, 'EmployeeCode')) === value);
    this.employeeHours.at(index).patchValue({
      employeeCode: value ? Number(value) : null,
      employeeName: employee ? this.read(employee, 'EmpFullName', 'EmployeeName') : '',
      branchCode: employee ? this.read(employee, 'BranchCode') : null
    });
    this.onEmployeeEdited(index);
  }

  onHeaderEmployeeChanged(nameControl: string, codeControl: string, value: string): void {
    const employee = this.employees().find(item =>
      String(this.read(item, 'EmpFullName', 'EmployeeName') ?? '').trim().toLowerCase() === value.trim().toLowerCase());
    this.form.patchValue({
      [nameControl]: employee ? this.read(employee, 'EmpFullName', 'EmployeeName') : value,
      [codeControl]: employee ? Number(this.read(employee, 'EmployeeCode')) : null
    }, { emitEvent: false });
  }

  onSalesOrderSelected(value: string): void {
    const order = this.salesOrders().find(item =>
      String(this.read(item, 'SONo', 'SalesOrderNo', 'JobNo')).trim().toLowerCase() === value.trim().toLowerCase());
    const jobCode = order ? Number(this.read(order, 'SOCode', 'SalesOrderCode', 'JobCode')) : null;
    this.form.patchValue({
      jobCode,
      jobNo: order ? this.read(order, 'SONo', 'SalesOrderNo', 'JobNo') : '',
      customer: order ? this.read(order, 'CustomerName', 'ClientName') ?? this.form.get('customer')?.value : this.form.get('customer')?.value
    });
    if (order && jobCode) {
      this.form.get('jobNo')?.disable({ emitEvent: false });
      this.loadSalesOrderDetails(jobCode);
    }
  }

  onSalesOrderTextChanged(value: string): void {
    const order = this.salesOrders().find(item => String(this.read(item, 'SONo', 'SalesOrderNo', 'JobNo')).trim().toLowerCase() === value.trim().toLowerCase());
    const jobCode = order ? Number(this.read(order, 'SOCode', 'SalesOrderCode', 'JobCode')) : null;
    this.form.patchValue({ jobCode });
    if (!order) this.form.get('jobNo')?.enable({ emitEvent: false });
  }

  private loadSalesOrderDetails(jobCode: number): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    const basic = this.toNumber(this.form.get('basicHrs')?.value);
    const docDate = this.form.get('docDate')?.value || '1900-01-01';

    this.dailySiteService.getSalesOrderDetails(jobCode, basic, this.id, 0, docDate).subscribe({
      next: tables => {
        const header = tables?.[0]?.[0] ?? {};
        // Desktop reads Division from Tables[1] (Scope of Work) row 0, not the header table -
        // see DailySite.xaml.cs: `division = Convert.ToInt32(dsSideGrid.Tables[1].Rows[0]["Division"])`.
        const scopeFirstRow = tables?.[1]?.[0] ?? {};

        // Matches the desktop app's SO-selection handler: hdnCustomerCode is taken from the SO
        // header, then the displayed name is resolved through the customer lookup (CustomerDictionary).
        const customerCode = this.toNumber(this.read(header, 'CustomerCode', 'ClientCode')) || null;
        const customerFromLookup = this.findLookup(this.customers(), customerCode, ['CustomerCode']);

        this.form.patchValue({
          customerCode,
          customer: customerFromLookup ? this.read(customerFromLookup, 'CustomerName') : this.read(header, 'CustomerName', 'ClientName'),
          division: this.read(scopeFirstRow, 'Division') ?? 0,
          startDate: this.toDateInputValue(this.read(header, 'StartDate')),
          finishDate: this.toDateInputValue(this.read(header, 'FinishDate', 'CloseDate')),
          location: this.read(header, 'ProjectOrLocation', 'Location'),
          project: this.read(header, 'ProjectOrLocation', 'Project'),
          startTime: this.toTimeInputValue(this.read(header, 'StartTime')),
          basicHrs: this.read(header, 'MinHrs', 'Basic'),
          scopeManhours: this.read(header, 'ManHours', 'ScopeManhours'),
          previousManhours: this.read(header, 'PreviousManhours') ?? 0
        });

        this.scopeOfWork.clear();
        this.expandedScopeGroups.clear();
        this.material.clear();
        this.employeeHours.clear();
        this.consumables.clear();
        this.machineries.clear();
        this.branchHours.clear();
        (tables?.[1] ?? []).forEach(row => this.addScopeRow(row));
        (tables?.[2] ?? []).forEach(row => this.addMaterialRow(row));
        (tables?.[3] ?? []).forEach(row => this.addConsumableRow(row));
        (tables?.[4] ?? []).forEach(row => this.addMachineryRow(row));
        (tables?.[5] ?? []).forEach(row => this.addEmployeeHourRow(row));
        (tables?.[6] ?? []).forEach(row => this.addBranchHourRow(row));
        this.resolveLookupNames();
        this.calculateDailySite();
        this.loadExistingSalesOrders(jobCode);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Could not load Sales Order details.');
      }
    });
  }

  private loadExistingSalesOrders(jobCode: number): void {
    this.dailySiteService.getExistingSalesOrders(jobCode).subscribe({
      next: orders => this.existingSalesOrders.set(orders ?? []),
      error: () => this.existingSalesOrders.set([])
    });
  }

  onExistingSalesOrderChanged(value: string): void {
    const order = this.existingSalesOrders().find(item => String(this.read(item, 'SONo', 'SalesOrderNo')).trim().toLowerCase() === value.trim().toLowerCase());
    const existingJobCode = order ? Number(this.read(order, 'SOCode', 'SalesOrderCode')) : null;
    this.form.patchValue({ existingJobCode });
    // Reload Scope of Work (and Division-driven grouping) for the selected revision - same as
    // picking the main Sales Order field. Without this, the grid stayed stuck on whatever was
    // loaded from the first selection and never reflected the chosen revision's own scope/division.
    if (existingJobCode) this.loadSalesOrderDetails(existingJobCode);
  }

  onLookupTextChanged(row: any, nameControl: string, codeControl: string, value: string, items: any[], codeKeys: string[], nameKeys: string[]): void {
    const normalizedValue = value.trim().toLowerCase();
    const item = items.find(entry => String(this.read(entry, ...nameKeys) ?? '').trim().toLowerCase() === normalizedValue);
    const values: Record<string, unknown> = {
      [nameControl]: item ? this.read(item, ...nameKeys) : value,
      [codeControl]: item ? Number(this.read(item, ...codeKeys)) : null
    };

    if (item && nameControl === 'employeeName') {
      values['branchCode'] = this.read(item, 'BranchCode');
    } else if (item && nameControl === 'materialName') {
      values['packSize'] = this.read(item, 'PackSize', 'PackingSize') ?? '';
      values['unit'] = this.read(item, 'Unit', 'UnitDesc') ?? '';
      values['totalMaterialEstimatedQty'] = this.read(item, 'TotalMaterialEstimatedQty', 'EstimatedQuantity', 'Quantity') ?? 0;
    } else if (item && nameControl === 'consumableName') {
      // Quantity for a manually-added (Direct) row comes from current stock on hand, not the
      // consumable master record - ItemCode in InvoiceMaterialStockForConsumableAndTAE matches
      // ConsumableCode here.
      const consumableCode = this.read(item, ...codeKeys);
      const stock = this.findLookup(this.consumableStock(), consumableCode, ['ItemCode']);
      values['quantity'] = this.read(stock, 'Qty') ?? 0;
    } else if (item && nameControl === 'machineryName') {
      values['estimatedQuantity'] = this.read(item, 'EstimatedQuantity', 'Quantity') ?? 0;
    }

    row.patchValue(values, { emitEvent: false });
    if (nameControl === 'employeeName') this.onEmployeeEdited(this.employeeHours.controls.indexOf(row));
    if (nameControl === 'surfacePreparationName') this.recalculateScopeRow(this.scopeOfWork.controls.indexOf(row));
    if (nameControl === 'materialName') this.recalculateMaterialRow(this.material.controls.indexOf(row));
  }

  isDivisionOne(): boolean {
    return Number(this.form.get('division')?.value ?? 0) === 1;
  }

  switchTab(key: TabKey): void {
    this.activeTab.set(key);
    this.errorMessage.set(null);
  }

  get scopeDisplayIndexes(): number[] {
    const groupOrder = new Map<string, number>();
    for (const control of this.scopeOfWork.controls) {
      const scope = String(control.get('scope')?.value ?? '').trim();
      const slNo = this.toNumber(control.get('slNo')?.value);
      if (!groupOrder.has(scope) || slNo < groupOrder.get(scope)!) {
        groupOrder.set(scope, slNo);
      }
    }
    return this.scopeOfWork.controls
      .map((_, index) => index)
      .sort((left, right) => {
        const groupOrderDiff = (groupOrder.get(this.scopeGroupValue(left)) ?? 0)
          - (groupOrder.get(this.scopeGroupValue(right)) ?? 0);
        if (groupOrderDiff !== 0) return groupOrderDiff;
        return this.toNumber(this.scopeOfWork.at(left).get('slNo')?.value)
          - this.toNumber(this.scopeOfWork.at(right).get('slNo')?.value);
      });
  }

  // These all take the already-sorted `indexes` array (computed once per render via
  // scopeDisplayIndexes, passed down from the template) instead of recomputing the sort
  // themselves - with N rows, re-sorting per-row per-helper made rendering the Scope of
  // Work tab roughly O(N^2 log N) per change-detection cycle and got very slow as rows grew.
  isScopeGroupStart(indexes: number[], displayIndex: number): boolean {
    if (displayIndex === 0) return true;
    return this.scopeGroupValue(indexes[displayIndex]) !== this.scopeGroupValue(indexes[displayIndex - 1]);
  }

  scopeGroupLabel(indexes: number[], displayIndex: number): string {
    const scope = this.scopeGroupValue(indexes[displayIndex]);
    return scope ? `Scope: ${scope}` : 'Scope';
  }

  isScopeGroupCollapsed(indexes: number[], displayIndex: number): boolean {
    return !this.expandedScopeGroups.has(this.scopeGroupValue(indexes[displayIndex]));
  }

  toggleScopeGroup(indexes: number[], displayIndex: number): void {
    const scope = this.scopeGroupValue(indexes[displayIndex]);
    if (this.expandedScopeGroups.has(scope)) {
      this.expandedScopeGroups.delete(scope);
    } else {
      this.expandedScopeGroups.add(scope);
    }
  }

  scopeGroupColor(indexes: number[], displayIndex: number): string {
    const scope = this.scopeGroupValue(indexes[displayIndex]);
    let totalAreaCompleted = 0;
    for (const index of indexes) {
      if (this.scopeGroupValue(index) === scope) {
        totalAreaCompleted += this.toNumber(this.scopeOfWork.at(index).get('areaCompleted')?.value);
      }
    }
    return totalAreaCompleted <= 0 ? 'royalblue' : 'forestgreen';
  }

  private scopeGroupValue(index: number): string {
    return String(this.scopeOfWork.at(index).get('scope')?.value ?? '').trim();
  }

  private resolveLookupNames(): void {
    const supervisor = this.findLookup(this.employees(), this.form.get('supervisor')?.value, ['EmployeeCode']);
    const engineer = this.findLookup(this.employees(), this.form.get('engineer')?.value, ['EmployeeCode']);
    const materialsReceivedBy = this.findLookup(this.employees(), this.form.get('materialsReceivedBy')?.value, ['EmployeeCode']);
    const customer = this.findLookup(this.customers(), this.form.get('customerCode')?.value, ['CustomerCode']);
    this.form.patchValue({
      supervisorName: this.form.get('supervisorName')?.value || this.read(supervisor, 'EmpFullName', 'EmployeeName'),
      engineerName: this.form.get('engineerName')?.value || this.read(engineer, 'EmpFullName', 'EmployeeName'),
      materialsReceivedByName: this.form.get('materialsReceivedByName')?.value || this.read(materialsReceivedBy, 'EmpFullName', 'EmployeeName'),
      customer: this.form.get('customer')?.value || this.read(customer, 'CustomerName')
    }, { emitEvent: false });

    for (const row of this.scopeOfWork.controls) {
      const preparation = this.findLookup(this.scopePreparations(), row.get('surfacePreparationCode')?.value, ['SurfacePreparationCode']);
      const unit = this.findLookup(this.units(), row.get('unitCode')?.value, ['UnitCode']);
      row.patchValue({
        surfacePreparationName: row.get('surfacePreparationName')?.value || this.read(preparation, 'SurfacePreparationName'),
        unitName: row.get('unitName')?.value || this.read(unit, 'UnitDesc', 'UnitName')
      }, { emitEvent: false });
    }

    for (const row of this.material.controls) {
      const item = this.findLookup(this.materials(), row.get('materialCode')?.value, ['MaterialCode']);
      row.patchValue({ materialName: row.get('materialName')?.value || this.read(item, 'MaterialName') }, { emitEvent: false });
    }

    for (const row of this.consumables.controls) {
      const item = this.findLookup(this.consumablesLookup(), row.get('consumableCode')?.value, ['ConsumableCode']);
      row.patchValue({ consumableName: row.get('consumableName')?.value || this.read(item, 'Description', 'ConsumableName') }, { emitEvent: false });
    }

    for (const row of this.machineries.controls) {
      const item = this.findLookup(this.machineriesLookup(), row.get('toolsAndEquipmentCode')?.value, ['ToolsAndEquipmentCode']);
      const status = this.findLookup(this.machineryStatuses(), row.get('statusCode')?.value, ['StatusCode']);
      row.patchValue({
        machineryName: row.get('machineryName')?.value || this.read(item, 'Description', 'MachineryName'),
        statusName: row.get('statusName')?.value || this.read(status, 'StatusName')
      }, { emitEvent: false });
    }

    for (const row of this.employeeHours.controls) {
      const employee = this.findLookup(this.labourers(), row.get('employeeCode')?.value, ['EmployeeCode']);
      row.patchValue({ employeeName: row.get('employeeName')?.value || this.read(employee, 'EmpFullName', 'EmployeeName') }, { emitEvent: false });
    }

    for (const row of this.branchHours.controls) {
      row.patchValue({ branchName: this.resolveBranchName(row.get('branchCode')?.value) }, { emitEvent: false });
    }
  }

  private findLookup(items: any[], code: unknown, codeKeys: string[]): any {
    if (code === null || code === undefined || String(code).trim() === '') return undefined;
    return items.find(item => String(this.read(item, ...codeKeys)) === String(code));
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.dailySiteService.getById(this.id).subscribe({
      next: (res) => {
        const hdr = this.firstRecord(res, 'Header', 'header');
        // Desktop reads Division from the Scope of Work rows, not the header - see
        // DailySite.xaml.cs: `division = Convert.ToInt32(dtScopeOfWork.Rows[0]["Division"])`.
        const scopeRows = this.responseArray(res, 'ScopeOfWork', 'scopeOfWork');
        this.form.patchValue({
          docNo: this.read(hdr, 'DocNo'),
          docDate: this.toDateInputValue(this.read(hdr, 'DocDate')),
          jobNo: this.read(hdr, 'JobDesc'),
          jobCode: this.read(hdr, 'JobCode', 'SOCode'),
          division: this.read(scopeRows[0], 'Division') ?? 0,
          customerCode: this.read(hdr, 'ClientCode', 'CustomerCode'),
          customer: this.read(hdr, 'CustomerName', 'ClientName'),
          startDate: this.toDateInputValue(this.read(hdr, 'StartDate')),
          finishDate: this.toDateInputValue(this.read(hdr, 'FinishDate')),
          location: this.read(hdr, 'Location'),
          project: this.read(hdr, 'Project'),
          startTime: this.toTimeInputValue(this.read(hdr, 'StartTime')),
          basicHrs: this.read(hdr, 'MinHrs'),
          supervisor: this.read(hdr, 'Supervisor'),
          supervisorName: '',
          engineer: this.read(hdr, 'Engineer'),
          engineerName: '',
          materialsReceivedBy: this.read(hdr, 'PreparedBy'),
          materialsReceivedByName: '',
          remarks: this.read(hdr, 'Remarks'),
          scopeManhours: this.read(hdr, 'ScopeManhours'),
          todayManhours: this.read(hdr, 'TodayManhours'),
          todayManhoursPerc: this.read(hdr, 'TodayManhoursPerc'),
          previousManhours: this.read(hdr, 'PreviousManhours'),
          previousManhoursPerc: this.read(hdr, 'PreviousManhoursPerc'),
          grandTotalManhours: this.read(hdr, 'GrandTotalManhours'),
          grandTotalManhoursPerc: this.read(hdr, 'GrandTotalManhoursPerc'),
          balanceManhours: this.read(hdr, 'BalanceManhours'),
          balanceManhoursPerc: this.read(hdr, 'BalanceManhoursPerc'),
          excess: this.read(hdr, 'Excess'),
          excessPerc: this.read(hdr, 'ExcessPerc')
        });
        this.form.get('jobNo')?.disable({ emitEvent: false });

        scopeRows.forEach((r: any) => this.addScopeRow(r));
        this.responseArray(res, 'Material', 'material').forEach((r: any) => this.addMaterialRow(r));
        this.responseArray(res, 'ConsumablesOrMachineries', 'consumablesOrMachineries').forEach((r: any) => this.addEmployeeHourRow(r));
        this.responseArray(res, 'Consumables', 'consumables').forEach((r: any) => this.addConsumableRow(r));
        this.responseArray(res, 'ConsumablesDR', 'consumablesDR').forEach((r: any) => this.addConsumableRow(r));
        this.responseArray(res, 'Machineries', 'machineries').forEach((r: any) => this.addMachineryRow(r));
        this.responseArray(res, 'BranchHrs', 'branchHrs').forEach((r: any) => this.addBranchHourRow(r));
        this.resolveLookupNames();

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load record.'); this.loading.set(false); }
    });
  }

  private toDateInputValue(value: unknown): string {
    if (!value) return '';
    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
    return match?.[0] ?? '';
  }

  private toTimeInputValue(value: unknown): string {
    if (!value) return '';
    const match = String(value).match(/(\d{2}:\d{2})/);
    return match?.[1] ?? '';
  }

  /** HTML date inputs use "" when blank; ASP.NET DateTime? cannot bind that. */
  private toOptionalIsoDate(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    return raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? raw;
  }

  /** HTML time inputs use "HH:mm"; ASP.NET DateTime needs a full date-time. */
  private toOptionalIsoDateTime(dateValue: unknown, timeValue: unknown): string | null {
    const time = String(timeValue ?? '').trim();
    if (!time) return null;
    const date = this.toOptionalIsoDate(dateValue) ?? '1900-01-01';
    const normalized = time.length === 5 ? `${time}:00` : time;
    return `${date}T${normalized}`;
  }

  private readSaveError(err: any): string {
    const errors = err?.error?.errors;
    if (errors && typeof errors === 'object') {
      const messages = Object.values(errors).flat().filter(Boolean);
      if (messages.length) return messages.join(' ');
    }
    return err?.error?.title || err?.error?.message || 'Save failed. Check the API console for details.';
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

  // ---------- Scope of Work rows ----------
  addScopeRow(data?: any): void {
    this.scopeOfWork.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.scopeOfWork.length + 1],
      scope: [this.read(data, 'Scope') ?? ''],
      surfacePreparationCode: [this.read(data, 'SurfacePreparationCode') ?? null],
      surfacePreparationName: [this.read(data, 'SurfacePreparationName') ?? ''],
      specialRequirement: [this.read(data, 'SpecialRequirement') ?? ''],
      unitCode: [this.read(data, 'UnitCode') ?? null],
      unitName: [this.read(data, 'UnitDesc') ?? ''],
      scopeOfWorkAsPerJobCard: [this.read(data, 'ScopeOfWorkAsPerJobCard') ?? 0],
      areaCompleted: [this.read(data, 'AreaCompleted') ?? 0],
      manhourEngaged: [this.read(data, 'ManhourEngaged') ?? 0],
      achievedRate: [{ value: this.read(data, 'AchievedRate') ?? 0, disabled: true }],
      achievedRateForEachActivity: [{ value: this.round2(this.toNumber(this.read(data, 'AchievedRateForEachActivity'))), disabled: true }],
      totalAreaCompleted: [{ value: this.read(data, 'TotalAreaCompleted') ?? 0, disabled: true }],
      balanceToComplete: [{ value: this.read(data, 'BalanceToComplete') ?? 0, disabled: true }]
    }));
  }
  removeScopeRow(slNo: unknown): void { this.removeRowBySlNo(this.scopeOfWork, slNo); }

  // Web equivalent of gvScopeOfWork_CellEditEnded in DailySite.xaml.cs.
  recalculateScopeRow(index: number): void {
    if (index < 0) return;
    const row = this.scopeOfWork.at(index);
    const areaCompleted = this.toNumber(row.get('areaCompleted')?.value);
    const manhourEngaged = this.toNumber(row.get('manhourEngaged')?.value);
    const scopeOfWorkAsPerJobCard = this.toNumber(row.get('scopeOfWorkAsPerJobCard')?.value);
    const surfacePreparationCode = this.toNumber(row.get('surfacePreparationCode')?.value);
    const slNo = this.toNumber(row.get('slNo')?.value);
    const specialRequirement = this.toText(row.get('specialRequirement')?.value);

    // Desktop divides ManhourEngaged by AreaCompleted; when AreaCompleted is 0 that throws and
    // aborts the whole recalculation, so the row is left untouched here too.
    if (areaCompleted === 0) return;

    const achievedRate = (manhourEngaged / areaCompleted) === 0 ? 1 : this.round2(areaCompleted);
    row.patchValue({ achievedRate }, { emitEvent: false });

    const jobCode = this.toNumber(this.form.get('jobCode')?.value);
    this.dailySiteService.getScopeOfWorkContext(jobCode, surfacePreparationCode, this.id, scopeOfWorkAsPerJobCard, slNo, specialRequirement)
      .subscribe({
        next: ctx => {
          const totalAreaCompleted = areaCompleted + this.toNumber(ctx?.totalAreaCompleted);
          const cnt = this.toNumber(ctx?.cnt) || 1;
          const achievedRateForEachActivity = this.round2((achievedRate + this.toNumber(ctx?.achievedRateForEachActivity)) / cnt);

          if (totalAreaCompleted > scopeOfWorkAsPerJobCard) {
            this.errorMessage.set('Area Used Must Be Less Than or Equal To Area');
          }

          row.patchValue({
            totalAreaCompleted,
            achievedRateForEachActivity,
            balanceToComplete: scopeOfWorkAsPerJobCard - totalAreaCompleted
          }, { emitEvent: false });
        },
        error: () => this.errorMessage.set('Could not verify scope of work.')
      });
  }

  // ---------- Material rows ----------
  addMaterialRow(data?: any): void {
    const baseUnitCode = this.read(data, 'BaseUnitCode') ?? null;
    const row = this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.material)],
      // Rows loaded from the estimation have their Item Description locked - only a row you
      // add yourself via "+ Add Row" lets you pick the material, same as Consumables' Direct rows.
      materialCode: [this.read(data, 'MaterialCode') ?? null],
      materialName: [{ value: this.read(data, 'MaterialName') ?? '', disabled: !!data }],
      packSize: [this.toText(this.read(data, 'PackSize'))],
      unit: [this.toText(this.read(data, 'Unit'))],
      totalMaterialEstimatedQty: [this.read(data, 'TotalMaterialEstimatedQty') ?? 0],
      receivedQty: [{ value: this.read(data, 'ReceivedQty') ?? 0, disabled: true }],
      materialReceivedTodayAtSite: [this.read(data, 'MaterialReceivedTodayAtSite') ?? 0],
      todayConsumed: [this.read(data, 'TodayConsumed') ?? 0],
      balanceAtSite: [{ value: this.read(data, 'BalanceAtSite') ?? 0, disabled: true }],
      area: [this.read(data, 'Area') ?? 0],
      rateOfApplication: [{ value: this.read(data, 'RateOfApplication') ?? 0, disabled: true }],
      areaSupposedToCover: [{ value: this.read(data, 'AreaSupposedToCover') ?? 0, disabled: true }],
      todayMaterialsUsed: [{ value: this.read(data, 'TodayMaterialsUsed') ?? 0, disabled: true }],
      balanceMaterials: [{ value: this.read(data, 'BalanceMaterials') ?? 0, disabled: true }],
      remarks: [this.read(data, 'Remarks') ?? ''],
      bgColor: [this.read(data, 'BgColour', 'BgColor') ?? ''],
      baseUnitCode: [baseUnitCode],
      baseUnitName: [this.resolveUnitName(baseUnitCode)]
    });
    this.lastValidMaterialState.set(row, {
      todayConsumed: this.toNumber(row.get('todayConsumed')?.value),
      baseUnitCode: row.get('baseUnitCode')?.value
    });
    this.material.push(row);
  }
  removeMaterialRow(slNo: unknown): void { this.removeRowBySlNo(this.material, slNo); }

  // Web equivalent of gvMaterial_CellEditEnded in DailySite.xaml.cs.
  // Balance at Site/rate/coverage come straight from this row's own ReceivedQty/TodayConsumed values.
  // Today Materials Used adds in the running total from prior daily sites via the lightweight
  // usp_GetDailySiteMaterialPrevTotalUsed (plain sum of TodayConsumed, excluding this DailySiteCode,
  // with the same BaseUnitCode/PackSize divide rule applied per historical row) - not the old, much
  // heavier usp_GetDailySiteSOWisePreviousMaterialDtl (still available via getMaterialPreviousDetail,
  // just no longer called here).
  recalculateMaterialRow(index: number): void {
    if (index < 0) return;
    const row = this.material.at(index);
    const todayConsumed = this.toNumber(row.get('todayConsumed')?.value);
    const receivedQty = this.toNumber(row.get('receivedQty')?.value);
    const packSize = this.toNumber(row.get('packSize')?.value);
    const baseUnitCode = this.toNumber(row.get('baseUnitCode')?.value);

    if (this.packSizeDivideUnitCodes.includes(baseUnitCode) && packSize === 0) {
      this.confirmDialog.notify('Pack Size is 0 for this material - cannot use this Base Unit.').then(() => {
        row.patchValue({ baseUnitCode: '' }, { emitEvent: false });
        this.recalculateMaterialRow(index);
      });
      return;
    }

    // The check below compares against todayMaterialsUsed, which for these base units is already
    // divided by PackSize (same unit as ReceivedQty) - so the limit is just ReceivedQty, not
    // ReceivedQty * PackSize (that would compare packs against a KG-scale number and never trip).
    const receivedLimit = receivedQty;

    const area = this.toNumber(row.get('area')?.value);
    const consumedContribution = this.packSizeDivideUnitCodes.includes(baseUnitCode)
      ? (todayConsumed !== 0 ? this.round2(todayConsumed / packSize) : 0)
      : todayConsumed;
    const rateOfApplication = (area !== 0 && todayConsumed !== 0) ? this.round2(area / todayConsumed) : 0;
    const areaSupposedToCover = todayConsumed !== 0 ? Math.round(todayConsumed) : 0;

    row.patchValue({
      rateOfApplication,
      areaSupposedToCover
    }, { emitEvent: false });

    const materialCode = this.toNumber(row.get('materialCode')?.value);
    const jobCode = this.toNumber(this.form.get('jobCode')?.value);
    this.dailySiteService.getMaterialPrevTotalUsed(jobCode, this.id, materialCode).subscribe({
      next: res => {
        const totalUsedPrev = this.toNumber(res?.totalUsed);
        const todayMaterialsUsed = this.round2(consumedContribution + totalUsedPrev);

        // The Received Qty check has to include the SP's running total from prior daily sites,
        // not just this row's own Today Consumed - otherwise entering a value that's fine on its
        // own but pushes the combined total over Received Qty slipped through silently.
        //
        // totalUsedPrev comes entirely from OTHER historical rows for this material, so it doesn't
        // change no matter what this row's Today Consumed/Base Unit is reverted to. If totalUsedPrev
        // alone already exceeds the limit (pre-existing over-consumption in older daily sites), every
        // possible value - including the "last valid" one and even 0 - will keep failing. Re-running
        // recalculateMaterialRow after a revert would just hit that same wall and loop the popup
        // forever, so the revert here is applied directly with the totalUsedPrev already in hand
        // instead of recursing into another round trip.
        if (todayMaterialsUsed > receivedLimit) {
          const previousValid = this.lastValidMaterialState.get(row) ?? { todayConsumed: 0, baseUnitCode: '' };
          const revertedBaseUnitCode = this.toNumber(previousValid.baseUnitCode);
          const revertedConsumedContribution = this.packSizeDivideUnitCodes.includes(revertedBaseUnitCode)
            ? (previousValid.todayConsumed !== 0 ? this.round2(previousValid.todayConsumed / packSize) : 0)
            : previousValid.todayConsumed;
          const revertedTodayMaterialsUsed = this.round2(revertedConsumedContribution + totalUsedPrev);
          const revertedBalanceAtSite = this.round2(receivedQty - revertedTodayMaterialsUsed);
          const totalMaterialEstimatedQtyReverted = this.toNumber(row.get('totalMaterialEstimatedQty')?.value);
          const revertedBalanceMaterials = this.round2(totalMaterialEstimatedQtyReverted - revertedTodayMaterialsUsed);

          this.confirmDialog.notify('Total Consumed Must Be Less Than or Equal To Received Qty').then(() => {
            row.patchValue({
              todayConsumed: previousValid.todayConsumed,
              baseUnitCode: previousValid.baseUnitCode,
              todayMaterialsUsed: revertedTodayMaterialsUsed,
              balanceAtSite: revertedBalanceAtSite,
              balanceMaterials: revertedBalanceMaterials
            }, { emitEvent: false });
          });
          return;
        }

        this.lastValidMaterialState.set(row, { todayConsumed, baseUnitCode });
        const balanceAtSite = this.round2(receivedQty - todayMaterialsUsed);
        const totalMaterialEstimatedQty = this.toNumber(row.get('totalMaterialEstimatedQty')?.value);
        const balanceMaterials = this.round2(totalMaterialEstimatedQty - todayMaterialsUsed);
        row.patchValue({
          todayMaterialsUsed,
          balanceAtSite,
          balanceMaterials
        }, { emitEvent: false });
      },
      error: () => this.errorMessage.set('Could not verify material usage.')
    });
  }

  addEmployeeHourRow(data?: any): void {
    this.employeeHours.push(this.fb.group({
      chkYesNo: [this.read(data, 'ChkYesNo') ?? false],
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.employeeHours)],
      employeeCode: [this.read(data, 'EmployeeCode') ?? null],
      employeeName: [this.read(data, 'EmpFullName', 'EmployeeName') ?? ''],
      branchCode: [this.read(data, 'BranchCode') ?? null],
      hrs: [this.read(data, 'Hrs') ?? 0],
      basic: [{ value: this.read(data, 'Basic') ?? 0, disabled: true }],
      normalHrs: [{ value: this.read(data, 'NormalHrs') ?? 0, disabled: true }],
      ot1: [{ value: this.read(data, 'OT1') ?? 0, disabled: true }],
      ot2: [{ value: this.read(data, 'OT2') ?? 0, disabled: true }],
      totalHrs: [{ value: this.read(data, 'TotalHrs') ?? 0, disabled: true }],
      idle: [{ value: this.read(data, 'Idle') ?? 0, disabled: true }],
      transport: [this.read(data, 'Transport') ?? 0]
    }));
  }
  removeEmployeeHourRow(slNo: unknown): void { this.removeRowBySlNo(this.employeeHours, slNo); }

  onEmployeeEdited(index: number): void {
    const row = this.employeeHours.at(index);
    const employeeCode = row.get('employeeCode')?.value;
    if (employeeCode !== null && employeeCode !== undefined && String(employeeCode).trim() !== '') {
      const duplicate = this.employeeHours.controls.some((other, otherIndex) =>
        otherIndex !== index && String(other.get('employeeCode')?.value ?? '') === String(employeeCode));
      if (duplicate) {
        row.patchValue({ employeeCode: null, employeeName: '' }, { emitEvent: false });
        this.errorMessage.set('Employee is already entered.');
        return;
      }
      this.recalculateEmployeeRow(index);
    }
  }

  // Web equivalent of gvConsumbalesAndMachineries_CellEditEnded in DailySite.xaml.cs: resolves the
  // employee's Basic hours (NormalHoursPerDay / Ramadan override), checks whether they already have
  // hours logged on this date at another site, and applies the same Normal/OT1/OT2/Idle formula.
  recalculateEmployeeRow(index: number): void {
    const row = this.employeeHours.at(index);
    const employeeCode = this.toNumber(row.get('employeeCode')?.value);
    const docDate = this.toOptionalIsoDate(this.form.get('docDate')?.value) ?? '1900-01-01';

    this.dailySiteService
      .getEmployeeHourContext(employeeCode, docDate, this.id, this.settings.branchCode(), this.settings.periodId())
      .subscribe({
        next: ctx => this.applyEmployeeHourContext(index, ctx),
        error: () => this.errorMessage.set('Could not verify employee hours.')
      });
  }

  private applyEmployeeHourContext(index: number, ctx: any): void {
    const row = this.employeeHours.at(index);
    const actualHours = this.toNumber(row.get('hrs')?.value);

    if (ctx.branchCode) row.patchValue({ branchCode: ctx.branchCode }, { emitEvent: false });

    let basic: number;
    if (ctx.isRamadan && ctx.currentDesigCode !== 63) {
      basic = ctx.ramadanHrs || 6;
    } else if (ctx.employeeFound) {
      basic = ctx.currentDesigCode === 63 ? (ctx.normalHoursPerDay || 8) : this.toNumber(row.get('basic')?.value);
      if (basic === 0) basic = ctx.normalHoursPerDay || 8;
    } else {
      basic = this.toNumber(this.form.get('basicHrs')?.value);
    }

    const existingHrs = this.toNumber(ctx.existingHrs);
    const existingNormalHrs = this.toNumber(ctx.existingNormalHrs);

    if (actualHours + existingHrs > 24) {
      row.patchValue({ hrs: 0, normalHrs: 0, ot1: 0, ot2: 0, idle: 0, totalHrs: 0 }, { emitEvent: false });
      this.errorMessage.set(ctx.existingDailySiteNo
        ? `Total hours worked should be less than or equal to 24. Employee already entered in '${ctx.existingDailySiteNo}'.`
        : 'Total hours worked should be less than or equal to 24.');
      this.calculateDailySite();
      return;
    }

    let normalHours = actualHours > basic ? basic : actualHours;
    let totalActualHours = actualHours;

    if (ctx.alreadyExistsElsewhere) {
      totalActualHours = actualHours + existingNormalHrs;
      if (existingNormalHrs > basic) {
        normalHours = 0;
      } else if (totalActualHours > 0 && existingNormalHrs > 0 && (existingNormalHrs + actualHours) > basic) {
        normalHours = basic - existingNormalHrs;
      }
    }

    let overtime1 = totalActualHours - basic;
    let idleHours = overtime1 >= 0 ? 0 : Math.abs(overtime1);
    overtime1 = overtime1 > 0 ? overtime1 : 0;
    let overtime2 = 0;
    let totalHours = normalHours + overtime1 + overtime2;

    const dateValue = this.form.get('docDate')?.value;
    const isSunday = dateValue ? new Date(`${dateValue}T00:00:00`).getDay() === 0 : false;
    if (isSunday || ctx.isHoliday) {
      totalHours = actualHours;
      overtime1 = 0;
      idleHours = 0;
      overtime2 = actualHours;
      normalHours = 0;
    }

    row.patchValue({
      basic,
      normalHrs: normalHours,
      ot1: overtime1,
      ot2: overtime2,
      idle: idleHours,
      totalHrs: totalHours,
      transport: row.get('transport')?.value || 0
    }, { emitEvent: false });
    this.calculateDailySite();
  }

  calculateDailySite(): void {
    const scope = this.toNumber(this.form.get('scopeManhours')?.value);
    const today = this.employeeHours.controls
      .reduce((sum, row) => sum + this.toNumber(row.get('hrs')?.value), 0);
    const previous = this.toNumber(this.form.get('previousManhours')?.value);
    const grandTotal = today + previous;
    const balance = scope - grandTotal;
    const percentage = (value: number) => scope === 0 ? 0 : Number(((value / scope) * 100).toFixed(3));

    this.form.patchValue({
      todayManhours: today,
      todayManhoursPerc: percentage(today),
      grandTotalManhours: grandTotal,
      grandTotalManhoursPerc: percentage(grandTotal),
      previousManhoursPerc: percentage(previous),
      balanceManhours: balance,
      balanceManhoursPerc: percentage(balance),
      excess: balance >= 0 ? 0 : balance,
      excessPerc: percentage(balance >= 0 ? 0 : balance)
    }, { emitEvent: false });
    this.updateBranchHours();
  }

  private updateBranchHours(): void {
    const grouped = new Map<number, number>();
    for (const row of this.employeeHours.controls) {
      if (!row.get('chkYesNo')?.value) continue;
      const branchCode = Number(row.get('branchCode')?.value ?? 0);
      if (!branchCode) continue;
      grouped.set(branchCode, (grouped.get(branchCode) ?? 0) + this.toNumber(row.get('hrs')?.value));
    }
    this.branchHours.clear({ emitEvent: false });
    for (const [branchCode, totalHrs] of grouped) this.addBranchHourRow({ BranchCode: branchCode, TotalHrs: totalHrs });
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
    return Math.round(value * 100) / 100;
  }

  addBranchHourRow(data?: any): void {
    const branchCode = this.read(data, 'BranchCode') ?? null;
    this.branchHours.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.branchHours)],
      branchCode: [branchCode],
      branchName: [this.resolveBranchName(branchCode)],
      totalHrs: [{ value: this.read(data, 'TotalHrs') ?? 0, disabled: true }]
    }));
  }

  private resolveBranchName(branchCode: unknown): string {
    const branch = this.findLookup(this.settings.branches(), branchCode, ['BranchCode']);
    return branch ? this.read(branch, 'BranchName') ?? '' : '';
  }

  private resolveUnitName(unitCode: unknown): string {
    const unit = this.findLookup(this.units(), unitCode, ['UnitCode']);
    return unit ? this.read(unit, 'UnitDesc') ?? '' : '';
  }
  removeBranchHourRow(slNo: unknown): void { this.removeRowBySlNo(this.branchHours, slNo); }

  // ---------- Consumables rows ----------
  addConsumableRow(data?: any): void {
    const baseUnitCode = this.read(data, 'BaseUnitCode') ?? null;
    // A row loaded from saved/estimation data carries its own Direct flag; a brand-new row
    // added via "+Add Row" is always Direct (manually entered, not derived from the job's
    // estimation). Quantity always stays read-only - Estimation-wise rows get it from the
    // estimation, Direct rows get it auto-filled from current stock (see onLookupTextChanged).
    const isDirect = data ? this.toNumber(this.read(data, 'Direct')) === 1 : true;
    this.consumables.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.consumables)],
      consumableCode: [this.read(data, 'ConsumableCode') ?? null],
      consumableName: [this.read(data, 'Description') ?? ''],
      quantity: [{ value: this.read(data, 'Quantity') ?? 0, disabled: true }],
      usedToday: [this.read(data, 'UsedToday') ?? 0],
      totalConsumablesUsed: [{ value: this.read(data, 'TotalConsumablesUsed') ?? 0, disabled: true }],
      bgColor: [this.read(data, 'BgColour', 'BgColor') ?? ''],
      baseUnitCode: [baseUnitCode],
      baseUnitName: [this.resolveUnitName(baseUnitCode)],
      direct: [isDirect ? 1 : 0]
    }));
  }
  removeConsumableRow(slNo: unknown): void { this.removeRowBySlNo(this.consumables, slNo); }

  // Web equivalent of gvConsumbales_CellEditEnded in DailySite.xaml.cs (only the "Used Today" edit recalculates).
  recalculateConsumableRow(index: number): void {
    if (index < 0) return;
    const row = this.consumables.at(index);
    const consumableCode = this.toNumber(row.get('consumableCode')?.value);
    const usedToday = this.toNumber(row.get('usedToday')?.value);
    const jobCode = this.toNumber(this.form.get('jobCode')?.value);

    this.dailySiteService.getConsumablePreviousDetail(jobCode, this.id, consumableCode).subscribe({
      next: ctx => {
        const totalConsumablesUsedPrev = this.toNumber(ctx?.totalConsumablesUsedPrev);
        row.patchValue({ totalConsumablesUsed: usedToday + totalConsumablesUsedPrev }, { emitEvent: false });
      },
      error: () => this.errorMessage.set('Could not verify consumable usage.')
    });
  }

  // ---------- Machineries rows ----------
  addMachineryRow(data?: any): void {
    this.machineries.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.machineries)],
      toolsAndEquipmentCode: [this.read(data, 'ToolsAndEquipmentCode') ?? null],
      machineryName: [this.read(data, 'Description') ?? ''],
      estimatedQuantity: [{ value: this.read(data, 'EstimatedQuantity') ?? 0, disabled: true }],
      availableToolsOrMachineryAtSite: [this.read(data, 'AvailableToolsOrMachineryAtSite') ?? 0],
      noOfMachineUsedAtSite: [this.read(data, 'NoOfMachineUsedAtSite') ?? 0],
      noOfDaysUsedAtSite: [this.read(data, 'NoOfDaysUsedAtSite') ?? 0],
      noOfMachineryIdleAtSite: [this.read(data, 'NoOfMachineryIdleAtSite') ?? 0],
      statusCode: [this.read(data, 'StatusCode') ?? null],
      statusName: [this.read(data, 'StatusName') ?? ''],
      bgColor: [this.read(data, 'BgColour', 'BgColor') ?? '']
    }));
  }
  removeMachineryRow(slNo: unknown): void { this.removeRowBySlNo(this.machineries, slNo); }

  // Web equivalent of gvMachineries_CellEditEnded in DailySite.xaml.cs: available at site can never
  // exceed the estimated quantity - clamps back down and warns, same as the desktop's revert-to-OldData.
  onMachineryAvailableChanged(index: number): void {
    const row = this.machineries.at(index);
    const available = this.toNumber(row.get('availableToolsOrMachineryAtSite')?.value);
    const estimated = this.toNumber(row.get('estimatedQuantity')?.value);
    if (available > estimated) {
      row.patchValue({ availableToolsOrMachineryAtSite: estimated }, { emitEvent: false });
      this.errorMessage.set('Available Tools/Machinery at site Must Be Less Than or Equal To Quantity');
    }
  }

  private renumberRows(rows: FormArray): void {
    rows.controls.forEach((row, index) => row.get('slNo')?.setValue(index + 1, { emitEvent: false }));
  }

  private nextSlNo(rows: FormArray): number {
    return rows.controls.reduce((max, row) => Math.max(max, this.toNumber(row.get('slNo')?.value)), 0) + 1;
  }

  private removeRowBySlNo(rows: FormArray, slNo: unknown): void {
    const index = rows.controls.findIndex(row => String(row.get('slNo')?.value) === String(slNo));
    if (index >= 0) {
      rows.removeAt(index);
      this.renumberRows(rows);
    }
  }

  save(): void {
    if (this.form.get('docDate')?.invalid || this.form.get('jobNo')?.invalid || this.form.get('customer')?.invalid) {
      this.form.markAllAsTouched();
      this.activeTab.set('basic');
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);

    // Equivalent of StaticClass.BranchCode / StaticClass.PeriodId in the desktop app,
    // sourced from the Quick Settings panel (SettingsService).
    const branchCode = this.settings.branchCode();
    const periodId = this.settings.periodId();

    const v = this.form.getRawValue();
    const payload = {
      dailySiteCode: this.id,
      docNo: this.toText(v.docNo),
      docNoRev: '',
      docDate: this.toOptionalIsoDate(v.docDate),
      clientCode: this.toNumber(v.customerCode),
      jobCode: this.toNumber(v.jobCode),
      exsistSoCode: this.toNumber(v.existingJobCode),
      location: this.toText(v.location),
      project: this.toText(v.project),
      startDate: this.toOptionalIsoDate(v.startDate),
      finishDate: this.toOptionalIsoDate(v.finishDate),
      startTime: this.toOptionalIsoDateTime(v.docDate, v.startTime),
      closeTime: null,
      minHrs: this.toText(v.basicHrs),
      supervisor: this.toNumber(v.supervisor),
      engineer: this.toNumber(v.engineer),
      preparedBy: this.toNumber(v.materialsReceivedBy),
      remarks: this.toText(v.remarks),
      withoutMaterial: v.withoutMaterial ? 'Y' : 'N',
      scopeOfWork: this.scopeOfWork.getRawValue().map((row: any) => ({
        slNo: this.toNumber(row.slNo),
        surfacePreparationCode: this.toNumber(row.surfacePreparationCode),
        specialRequirement: this.toText(row.specialRequirement),
        unitCode: this.toNumber(row.unitCode),
        scopeOfWorkAsPerJobCard: this.toNumber(row.scopeOfWorkAsPerJobCard),
        areaCompleted: this.toNumber(row.areaCompleted),
        manhourEngaged: this.toNumber(row.manhourEngaged),
        achievedRate: this.toNumber(row.achievedRate),
        achievedRateForEachActivity: this.toNumber(row.achievedRateForEachActivity),
        totalAreaCompleted: this.toNumber(row.totalAreaCompleted),
        balanceToComplete: this.toNumber(row.balanceToComplete),
        scope: this.toText(row.scope),
        division: this.toNumber(v.division)
      })),
      material: this.material.getRawValue().map((row: any) => ({
        slNo: this.toNumber(row.slNo),
        materialCode: this.toNumber(row.materialCode),
        packSize: this.toText(row.packSize),
        unit: this.toText(row.unit),
        totalMaterialEstimatedQty: this.toNumber(row.totalMaterialEstimatedQty),
        receivedQty: this.toNumber(row.receivedQty),
        materialReceivedTodayAtSite: this.toNumber(row.materialReceivedTodayAtSite),
        todayConsumed: this.toNumber(row.todayConsumed),
        balanceAtSite: this.toNumber(row.balanceAtSite),
        area: this.toNumber(row.area),
        rateOfApplication: this.toNumber(row.rateOfApplication),
        areaSupposedToCover: this.toNumber(row.areaSupposedToCover),
        todayMaterialsUsed: this.toNumber(row.todayMaterialsUsed),
        balanceMaterials: this.toNumber(row.balanceMaterials),
        remarks: this.toText(row.remarks),
        bgColor: this.toText(row.bgColor),
        baseUnitCode: this.toNumber(row.baseUnitCode) || null
      })),
      consumablesAndMachineries: this.employeeHours.getRawValue(),
      // Split by the Direct flag into the two lists the backend saves separately - Estimation-wise
      // rows (Direct=0) go to "consumables", manually-added rows (Direct=1) go to "consumablesDR",
      // matching desktop's separate gvConsumbales / gvConsumbalesdirect grids and @dtConsumables /
      // @dtConsumablesDR table-valued parameters.
      consumables: this.consumables.getRawValue()
        .filter((row: any) => this.toNumber(row.direct) !== 1)
        .map((row: any) => ({
          slNo: this.toNumber(row.slNo),
          consumableCode: this.toNumber(row.consumableCode),
          quantity: this.toNumber(row.quantity),
          usedToday: this.toNumber(row.usedToday),
          totalConsumablesUsed: this.toNumber(row.totalConsumablesUsed),
          bgColor: this.toText(row.bgColor),
          baseUnitCode: this.toNumber(row.baseUnitCode) || null
        })),
      consumablesDR: this.consumables.getRawValue()
        .filter((row: any) => this.toNumber(row.direct) === 1)
        .map((row: any) => ({
          slNo: this.toNumber(row.slNo),
          consumableCode: this.toNumber(row.consumableCode),
          quantity: this.toNumber(row.quantity),
          usedToday: this.toNumber(row.usedToday),
          totalConsumablesUsed: this.toNumber(row.totalConsumablesUsed),
          bgColor: this.toText(row.bgColor),
          baseUnitCode: this.toNumber(row.baseUnitCode) || null
        })),
      machineries: this.machineries.getRawValue().map((row: any) => ({
        slNo: this.toNumber(row.slNo),
        toolsAndEquipmentCode: this.toNumber(row.toolsAndEquipmentCode),
        estimatedQuantity: this.toNumber(row.estimatedQuantity),
        availableToolsOrMachineryAtSite: this.toNumber(row.availableToolsOrMachineryAtSite),
        noOfMachineUsedAtSite: this.toNumber(row.noOfMachineUsedAtSite),
        noOfDaysUsedAtSite: this.toNumber(row.noOfDaysUsedAtSite),
        noOfMachineryIdleAtSite: this.toNumber(row.noOfMachineryIdleAtSite),
        statusCode: this.toNumber(row.statusCode),
        bgColor: this.toText(row.bgColor)
      })),
      branchHrs: this.branchHours.getRawValue(),
      scopeManhours: this.toNumber(v.scopeManhours),
      todayManhours: this.toNumber(v.todayManhours),
      previousManhours: this.toNumber(v.previousManhours),
      grandTotalManhours: this.toNumber(v.grandTotalManhours),
      balanceManhours: this.toNumber(v.balanceManhours),
      todayManhoursPerc: this.toNumber(v.todayManhoursPerc),
      previousManhoursPerc: this.toNumber(v.previousManhoursPerc),
      grandTotalManhoursPerc: this.toNumber(v.grandTotalManhoursPerc),
      balanceManhoursPerc: this.toNumber(v.balanceManhoursPerc),
      excess: this.toText(v.excess),
      excessPerc: this.toNumber(v.excessPerc),
      mode: this.isNew ? 0 : 1
    };

    const wasNew = this.isNew;
    this.dailySiteService.save(payload, branchCode, periodId).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        // Matches the desktop app's SaveButton_Click: MessageBox.Show(result), where result
        // is whatever usp_ManageDailySite returns for the Save (Mode 0) / Update (Mode 1) it just ran.
        this.confirmDialog.notify(res?.result || (wasNew ? 'Saved Successfully' : 'Updated Successfully'));
        this.router.navigate(['/daily-site']);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(this.readSaveError(err));
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/daily-site']);
  }

  // Opens the print report in a new tab - a report is a separate document, not a form to
  // navigate away to, matching the same "new tab per form" pattern used elsewhere.
  print(): void {
    const a = document.createElement('a');
    a.href = `/daily-site/${this.id}/print`;
    a.target = '_blank';
    a.click();
  }

  // Matches desktop's "Demo" print button (PrintButton_Click1 / Report_DailySiteReportDemo.rdlc):
  // preview the report using whatever is currently on screen, before saving. Two pieces come from
  // fresh queries keyed by the selected Sales Order (Materials, Scope hrs) exactly like desktop -
  // everything else comes from the live form.
  printDemo(): void {
    const v = this.form.getRawValue();
    const jobCode = this.toNumber(v.jobCode);

    forkJoin({
      material: this.dailySiteService.getDemoMaterial(jobCode),
      scopeHrs: this.dailySiteService.getDemoScopeHrs(jobCode)
    }).subscribe({
      next: ({ material, scopeHrs }) => this.openDemoPreview(v, material, scopeHrs.scopeHrs),
      // Matches desktop: if these queries fail (e.g. no job selected yet), the report just
      // proceeds without them rather than blocking the preview entirely.
      error: () => this.openDemoPreview(v, [], '')
    });
  }

  private openDemoPreview(v: any, demoMaterial: any[], scopeHrs: string): void {
    const header = {
      DocNo: v.docNo,
      DocDate: v.docDate,
      CustomerName: v.customer,
      JobNoAutoGen: v.jobNo,
      Location: v.location,
      Project: v.project,
      SupervisorName: v.supervisorName,
      EngineerName: v.engineerName,
      PreparedByName: v.materialsReceivedByName,
      ScopeManhours: scopeHrs
    };

    // Matches desktop exactly: the Demo report's "Balance to complete" column is overwritten to
    // show the row's Scope text instead of the computed numeric balance - a literal desktop quirk,
    // not a mistake here.
    const scopeOfWork = (v.scopeOfWork ?? []).map((row: any) => ({
      SlNo: row.slNo,
      SurfacePreparationName: row.surfacePreparationName,
      UnitDesc: row.unitName,
      AreaCompleted: row.areaCompleted,
      ManhourEngaged: row.manhourEngaged,
      AchievedRate: row.achievedRate,
      AchievedRateForEachActivity: row.achievedRateForEachActivity,
      ScopeOfWorkAsPerJobCard: row.scopeOfWorkAsPerJobCard,
      TotalAreaCompleted: row.totalAreaCompleted,
      BalanceToComplete: row.scope
    }));

    // Materials come from the Sales Order's estimated requirement query (demoMaterial), not the
    // on-screen "material received today" grid - matches desktop's Demo exactly.
    const material = (demoMaterial ?? []).map((row: any) => ({
      Description: this.read(row, 'Description'),
      Units: this.read(row, 'Units'),
      Units1: this.read(row, 'Units1'),
      Received: this.read(row, 'Received')
    }));

    // Desktop's Demo report zips only Consumables + Machineries together by row position into one
    // combined table - no Manhours/employee data in this particular table.
    const consumables = v.consumables ?? [];
    const machineries = v.machineries ?? [];
    const rowCount = Math.max(consumables.length, machineries.length);
    const consumablesOrMachineries = Array.from({ length: rowCount }, (_, i) => ({
      SlNo: i + 1,
      ConsumableName: consumables[i]?.consumableName,
      ConsumableQuantity: consumables[i]?.quantity,
      ToolsAndEquipmentName: machineries[i]?.machineryName,
      MachineriesQuantity: machineries[i]?.availableToolsOrMachineryAtSite
    }));

    // localStorage, not sessionStorage - sessionStorage isn't reliably copied to a new tab
    // (same issue that caused new tabs to show the login page earlier); localStorage always is.
    localStorage.setItem('dailySitePrintPreview', JSON.stringify({ header, scopeOfWork, material, consumablesOrMachineries }));

    const a = document.createElement('a');
    a.href = '/daily-site/0/print?preview=1';
    a.target = '_blank';
    a.click();
  }
}
