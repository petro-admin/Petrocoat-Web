import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ResourceReturnService } from '../services/resource-return.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { DateInputComponent } from '../../shared/date-input/date-input.component';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Production.ResourceRetrurn';

type TabKey = 'materials' | 'consumables' | 'tae' | 'taeHire' | 'general' | 'subcontract';

@Component({
  selector: 'app-resource-return-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DateInputComponent],
  templateUrl: './resource-return-detail.component.html',
  styleUrl: './resource-return-detail.component.scss'
})
export class ResourceReturnDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  matReturnCode = 0;
  activeTab = signal<TabKey>('materials');

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  issues = signal<any[]>([]);
  issueText = signal('');
  selectedIssue = signal<any>(null);

  warehouses = signal<any[]>([]);
  employees = signal<any[]>([]);
  costCenters = signal<any[]>([]);
  conditionsOfMachine = signal<any[]>([]);
  units = signal<any[]>([]);
  items = signal<any[]>([]);
  consumablesLookup = signal<any[]>([]);
  toolsLookup = signal<any[]>([]);

  materialReturnedByText = signal('');
  uploadingSlNo = signal<number | null>(null);

  approvalEnabled = signal(false);
  moduleCode = 0;
  approvalVisible = signal(false);
  approvalAction = signal<any>(null);
  approvalHistory = signal<any[][] | null>(null);
  approvalComment = signal('');
  approvalBusy = signal(false);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  get materials(): FormArray { return this.form.get('materials') as FormArray; }
  get consumables(): FormArray { return this.form.get('consumables') as FormArray; }
  get toolsAndEquipment(): FormArray { return this.form.get('toolsAndEquipment') as FormArray; }
  get toolsAndEquipmentHire(): FormArray { return this.form.get('toolsAndEquipmentHire') as FormArray; }
  get generalServices(): FormArray { return this.form.get('generalServices') as FormArray; }
  get subContract(): FormArray { return this.form.get('subContract') as FormArray; }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: ResourceReturnService,
    public settings: SettingsService,
    private confirmDialog: ConfirmDialogService,
    private approvalService: ApprovalService,
    private userRightsService: UserRightsService
  ) {
    this.form = this.fb.group({
      matReturnNo: [{ value: '', disabled: true }],
      matReturnDate: ['', Validators.required],
      warehouseCode: [null, Validators.required],
      costId: [null],
      projectDetails: [''],
      materials: this.fb.array([]),
      consumables: this.fb.array([]),
      toolsAndEquipment: this.fb.array([]),
      toolsAndEquipmentHire: this.fb.array([]),
      generalServices: this.fb.array([]),
      subContract: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.matReturnCode = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.matReturnCode === 0;

    this.loadRights();
    this.loadApprovalSettings();

    this.service.getLookups(this.settings.branchCode(), this.settings.companyCode()).subscribe({
      next: res => {
        this.warehouses.set(res?.warehouses ?? []);
        this.employees.set(res?.employees ?? []);
        this.costCenters.set(res?.costCenters ?? []);
        this.conditionsOfMachine.set(res?.conditionsOfMachine ?? []);
        this.units.set(res?.units ?? []);
        this.items.set(res?.items ?? []);
        this.consumablesLookup.set(res?.consumables ?? []);
        this.toolsLookup.set(res?.toolsAndEquipment ?? []);
      },
      error: () => this.errorMessage.set('Could not load lookup lists.')
    });

    this.service.getIssueList(this.settings.branchCode(), this.settings.periodId(), this.settings.companyCode()).subscribe({
      next: rows => this.issues.set(rows ?? []),
      error: () => this.errorMessage.set('Could not load Resource Issue list.')
    });

    if (this.isNew) {
      this.form.patchValue({ matReturnDate: this.today() });
      this.service.generateDocNo().subscribe({ next: res => this.form.patchValue({ matReturnNo: res?.matReturnNo ?? '' }) });
    } else {
      this.loadExisting();
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
    this.approvalService.getStatus(this.moduleCode, this.matReturnCode).subscribe({
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

  issueDisplay(row: any): string {
    return `${this.read(row, 'MatIssueNo')} - ${this.read(row, 'SONo') || 'GENERAL'} - ${this.read(row, 'PurReqnDetails') || ''}`;
  }

  onIssueTextChanged(value: string): void {
    this.issueText.set(value);
    const match = this.issues().find(i => this.issueDisplay(i).trim().toLowerCase() === value.trim().toLowerCase());
    this.selectedIssue.set(match ?? null);
    if (!match) return;

    const matIssueCode = this.toNumber(this.read(match, 'MatIssueCode'));
    this.loadIssueLines(matIssueCode);
  }

  onIssueSelected(value: string): void { this.onIssueTextChanged(value); }

  private loadIssueLines(matIssueCode: number): void {
    this.loading.set(true);
    forkJoin({
      info: this.service.getIssueInfo(matIssueCode),
      materials: this.service.getMaterialsForIssue(matIssueCode),
      consumables: this.service.getConsumablesForIssue(matIssueCode),
      tae: this.service.getTaeForIssue(matIssueCode),
      general: this.service.getGeneralForIssue(matIssueCode),
      subcontract: this.service.getSubContractForIssue(matIssueCode),
      taeHire: this.service.getTaeHireForIssue(matIssueCode)
    }).subscribe({
      next: res => {
        this.form.patchValue({ projectDetails: this.read(res.info, 'OtherDetails') ?? '' });
        this.materialReturnedByText.set(this.read(res.info, 'IssuedToName') ?? '');

        this.materials.clear();
        (res.materials ?? []).forEach((r: any) => this.addMaterialRow(this.materials, r, 'ItemCode', 'ReturnQty'));

        this.consumables.clear();
        (res.consumables ?? []).forEach((r: any) => this.addMaterialRow(this.consumables, r, 'ConsumableCode', 'ReturnedQty'));

        this.toolsAndEquipment.clear();
        (res.tae ?? []).forEach((r: any) => this.addTaeRow(r));

        this.generalServices.clear();
        (res.general ?? []).forEach((r: any) => this.addServiceRow(this.generalServices, r));

        this.subContract.clear();
        (res.subcontract ?? []).forEach((r: any) => this.addServiceRow(this.subContract, r));

        this.toolsAndEquipmentHire.clear();
        (res.taeHire ?? []).forEach((r: any) => this.addTaeHireRow(r));

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load the selected Resource Issue details.'); this.loading.set(false); }
    });
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getById(this.matReturnCode).subscribe({
      next: res => {
        const hdr = this.read(res, 'Header') ?? {};
        const matIssueCode = this.toNumber(this.read(hdr, 'MatIssueCode'));
        this.issueText.set(this.read(hdr, 'issueno') ?? '');
        this.selectedIssue.set({ MatIssueCode: matIssueCode });
        this.materialReturnedByText.set(this.read(hdr, 'issuedby') ?? '');

        this.form.patchValue({
          matReturnNo: this.read(hdr, 'MatReturnNo') ?? '',
          matReturnDate: this.toDateInputValue(this.read(hdr, 'MatReturnDate')) || this.today(),
          warehouseCode: this.toNumber(this.read(hdr, 'WareHouseCode')) || null,
          costId: this.toNumber(this.read(hdr, 'CostId')) || null,
          projectDetails: this.read(hdr, 'ProjectDetails') ?? ''
        });

        this.materials.clear();
        (this.read(res, 'Materials') ?? []).forEach((r: any) => this.addMaterialRow(this.materials, r, 'ItemCode', 'ReturnQty'));

        this.consumables.clear();
        (this.read(res, 'Consumables') ?? []).forEach((r: any) => this.addMaterialRow(this.consumables, r, 'ConsumableCode', 'ReturnedQty'));

        this.toolsAndEquipment.clear();
        (this.read(res, 'ToolsAndEquipment') ?? []).forEach((r: any) => this.addTaeRow(r));

        this.generalServices.clear();
        (this.read(res, 'GeneralServices') ?? []).forEach((r: any) => this.addServiceRow(this.generalServices, r));

        this.subContract.clear();
        (this.read(res, 'SubContract') ?? []).forEach((r: any) => this.addServiceRow(this.subContract, r));

        this.toolsAndEquipmentHire.clear();
        (this.read(res, 'ToolsAndEquipmentHire') ?? []).forEach((r: any) => this.addTaeHireRow(r));

        if (this.approvalEnabled()) this.loadApprovalStatus();
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this Resource Return.'); this.loading.set(false); }
    });
  }

  // ---------- Row builders ----------
  // codeKey/qtyKey handle the naming quirk shared by both source SPs (new-from-issue AND
  // edit-load use "ReturnQty" for Materials but "ReturnedQty" for Consumables/TAE - see
  // ResourceReturnService for the exact SP text this mirrors).
  addMaterialRow(array: FormArray, data: any, codeKey: 'ItemCode' | 'ConsumableCode', qtyKey: 'ReturnQty' | 'ReturnedQty'): void {
    array.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? array.length + 1],
      code: [this.toNumber(this.read(data, codeKey))],
      stockQty: [this.read(data, 'StockQty') ?? 0],
      estQty: [this.read(data, 'EstQty') ?? 0],
      availableQty: [this.read(data, 'AvailableQty') ?? 0],
      orderedQty: [this.read(data, 'OrderedQty') ?? 0],
      issuedQty: [this.read(data, 'IssuedQty') ?? 0],
      returnedQty: [this.read(data, qtyKey) ?? 0],
      balanceReturnedQty: [this.read(data, 'BalanceReturnedQty') ?? 0],
      balanceRequiredQty: [this.read(data, 'BalanceRequiredQty') ?? 0],
      unitCode: [this.toNumber(this.read(data, 'UnitCode'))],
      rate: [this.read(data, 'Rate') ?? 0],
      amount: [this.read(data, 'Amount') ?? 0],
      supplierCode: [this.toNumber(this.read(data, 'SupplierCode'))],
      balanceQty: [this.read(data, 'BalanceQty') ?? 0],
      expiryDate: [this.toDateInputValue(this.read(data, 'ExpiryDate'))]
    }));
  }

  addTaeRow(data: any): void {
    this.toolsAndEquipment.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.toolsAndEquipment.length + 1],
      toolsAndEquipmentCode: [this.toNumber(this.read(data, 'ToolsAndEquipmentCode'))],
      stockQty: [this.read(data, 'StockQty') ?? 0],
      qty: [this.read(data, 'Qty') ?? 0],
      returnedQty: [this.read(data, 'ReturnedQty') ?? 0],
      balanceReturnedQty: [this.read(data, 'BalanceReturnedQty') ?? 0],
      unitCode: [this.toNumber(this.read(data, 'UnitCode'))],
      noOfDays: [this.read(data, 'NoOfDays') ?? 0],
      issuedDate: [this.toDateInputValue(this.read(data, 'IssuedDate'))],
      returnDate: [this.toDateInputValue(this.read(data, 'ReturnDate'))],
      conditionOfMachine: [this.toNumber(this.read(data, 'ConditionOfMachine')) || null],
      description: [this.read(data, 'Description') ?? ''],
      docUpload: [this.read(data, 'DocUpload') ?? ''],
      expDate: [this.toDateInputValue(this.read(data, 'ExpDate'))],
      balanceQty: [this.read(data, 'BalanceQty') ?? 0]
    }));
  }

  addServiceRow(array: FormArray, data: any): void {
    array.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? array.length + 1],
      code: [this.toNumber(this.read(data, 'ItemCode'))],
      stockQty: [this.read(data, 'StockQty') ?? 0],
      qty: [this.read(data, 'Qty') ?? 0],
      returnedQty: [this.read(data, 'ReturnedQty') ?? 0],
      balanceReturnedQty: [this.read(data, 'BalanceReturnedQty') ?? 0],
      unitCode: [this.toNumber(this.read(data, 'UnitCode'))],
      rate: [this.read(data, 'Rate') ?? 0],
      amount: [this.read(data, 'Amount') ?? 0],
      supplierCode: [this.toNumber(this.read(data, 'SupplierCode'))],
      remarks: [this.read(data, 'Remarks') ?? ''],
      balanceQty: [this.read(data, 'BalanceQty') ?? 0]
    }));
  }

  addTaeHireRow(data: any): void {
    this.toolsAndEquipmentHire.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.toolsAndEquipmentHire.length + 1],
      toolsAndEquipmentCode: [this.toNumber(this.read(data, 'ToolsAndEquipmentCode'))],
      stockQty: [this.read(data, 'StockQty') ?? 0],
      qty: [this.read(data, 'Qty') ?? 0],
      returnedQty: [this.read(data, 'ReturnedQty') ?? 0],
      balanceReturnedQty: [this.read(data, 'BalanceReturnedQty') ?? 0],
      unitCode: [this.toNumber(this.read(data, 'UnitCode'))],
      noOfDays: [this.read(data, 'NoOfDays') ?? 0],
      issuedDate: [this.toDateInputValue(this.read(data, 'IssuedDate'))],
      returnDate: [this.toDateInputValue(this.read(data, 'ReturnDate'))],
      rate: [this.read(data, 'Rate') ?? 0],
      amount: [this.read(data, 'Amount') ?? 0],
      supplierCode: [this.toNumber(this.read(data, 'SupplierCode'))],
      description: [this.read(data, 'Description') ?? ''],
      docUpload: [this.read(data, 'DocUpload') ?? ''],
      expDate: [this.toDateInputValue(this.read(data, 'ExpDate'))],
      balanceQty: [this.read(data, 'BalanceQty') ?? 0]
    }));
  }

  // ---------- Return Qty validation (blocks entry beyond what's actually still returnable) ----------
  validateReturnQty(row: any, maxKey: string): void {
    const max = this.toNumber(row.get(maxKey)?.value);
    const entered = this.toNumber(row.get('returnedQty')?.value);
    if (entered > max) {
      row.patchValue({ returnedQty: max });
      this.errorMessage.set(`Return Qty cannot exceed ${max}.`);
    } else if (entered < 0) {
      row.patchValue({ returnedQty: 0 });
    }
  }

  switchTab(tab: TabKey): void { this.activeTab.set(tab); }

  // ---------- Document upload (Tools & Equipment / Hire) ----------
  onFileSelected(row: any, slNo: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingSlNo.set(slNo);
    this.service.uploadDocument(file, this.settings.branchCode()).subscribe({
      next: res => { row.patchValue({ docUpload: res.fileName }); this.uploadingSlNo.set(null); input.value = ''; },
      error: () => { this.errorMessage.set('File upload failed.'); this.uploadingSlNo.set(null); input.value = ''; }
    });
  }

  viewDocument(row: any): void {
    const path = row.get('docUpload')?.value;
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

  // ---------- Lookup name resolution ----------
  itemName(code: unknown): string {
    const item = this.items().find(i => this.toNumber(this.read(i, 'ItemCode')) === this.toNumber(code));
    return item ? this.read(item, 'ItemName') : '';
  }

  consumableName(code: unknown): string {
    const item = this.consumablesLookup().find(i => this.toNumber(this.read(i, 'ConsumableCode')) === this.toNumber(code));
    return item ? this.read(item, 'Specification') : '';
  }

  toolName(code: unknown): string {
    const item = this.toolsLookup().find(i => this.toNumber(this.read(i, 'ToolsAndEquipmentCode')) === this.toNumber(code));
    return item ? this.read(item, 'Specification') : '';
  }

  unitName(code: unknown): string {
    const unit = this.units().find(u => this.toNumber(this.read(u, 'UnitCode')) === this.toNumber(code));
    return unit ? (this.read(unit, 'UnitDesc') ?? this.read(unit, 'UnitName') ?? '') : '';
  }

  // ---------- Approval workflow ----------
  async toggleLock(): Promise<void> {
    if (this.isNew) return;
    const locked = this.read(this.approvalAction(), 'IsLocked') === 'L';
    const confirmMsg = locked ? 'Are you sure to Unlock this record ?' : 'Are you sure to Lock this record ?';
    if (!(await this.confirmDialog.confirm(confirmMsg))) return;

    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.matReturnCode, 'L', locked ? 'U' : 'L', this.approvalComment()).subscribe({
      next: (res) => { this.approvalBusy.set(false); this.confirmDialog.notify(res?.result ?? ''); this.loadApprovalStatus(); },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not update lock status.'); }
    });
  }

  approve(): void { this.actOnApproval('A', 'Approved!!'); }
  deny(): void { this.actOnApproval('D', 'Denied!!'); }

  private actOnApproval(action: string, successMessage: string): void {
    if (this.isNew) return;
    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.matReturnCode, 'A', action, this.approvalComment()).subscribe({
      next: () => { this.approvalBusy.set(false); this.confirmDialog.notify(successMessage); this.loadApprovalStatus(); },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not record the approval action.'); }
    });
  }

  loadApprovalHistory(): void {
    this.approvalService.getHistory(this.moduleCode, this.matReturnCode).subscribe({
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
    if (this.form.get('matReturnDate')?.invalid || this.form.get('warehouseCode')?.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please choose a Return Date and a Warehouse.');
      return;
    }
    if (!this.selectedIssue()) {
      this.errorMessage.set('Please select a Resource Issue No.');
      return;
    }

    if (!this.isNew) {
      this.approvalService.verify(FORM_CLASS_NAME, this.matReturnCode).subscribe({
        next: async ({ count }) => {
          if (count > 0) {
            if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
            this.approvalService.clearActions(FORM_CLASS_NAME, this.matReturnCode, this.moduleCode).subscribe({
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
      matReturnCode: this.matReturnCode,
      matIssueCode: this.toNumber(this.read(this.selectedIssue(), 'MatIssueCode')),
      matReturnNo: this.toText(v.matReturnNo),
      matReturnDate: v.matReturnDate,
      projectDetails: this.toText(v.projectDetails),
      costId: this.toNumber(v.costId),
      warehouseCode: this.toNumber(v.warehouseCode),
      materials: v.materials.map((r: any) => this.mapMaterialRow(r)),
      consumables: v.consumables.map((r: any) => this.mapMaterialRow(r)),
      toolsAndEquipment: v.toolsAndEquipment.map((r: any) => this.mapTaeRow(r)),
      generalServices: v.generalServices.map((r: any) => this.mapServiceRow(r)),
      subContract: v.subContract.map((r: any) => this.mapServiceRow(r)),
      toolsAndEquipmentHire: v.toolsAndEquipmentHire.map((r: any) => this.mapTaeHireRow(r))
    };

    this.service.save(payload, this.settings.branchCode(), this.settings.companyCode(), this.settings.periodId()).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.confirmDialog.notify(res?.result || (wasNew ? 'Data Saved' : 'Data Updated'));
        this.router.navigate(['/resource-return']);
      },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err?.error?.message || 'Save failed. Check the API console for details.'); }
    });
  }

  private mapMaterialRow(r: any): any {
    return {
      slNo: this.toNumber(r.slNo), code: this.toNumber(r.code), stockQty: this.toNumber(r.stockQty),
      estQty: this.toNumber(r.estQty), availableQty: this.toNumber(r.availableQty), orderedQty: this.toNumber(r.orderedQty),
      issuedQty: this.toNumber(r.issuedQty), returnedQty: this.toNumber(r.returnedQty), balanceRequiredQty: this.toNumber(r.balanceRequiredQty),
      unitCode: this.toNumber(r.unitCode), rate: this.toNumber(r.rate), amount: this.toNumber(r.amount),
      supplierCode: this.toNumber(r.supplierCode), balanceQty: this.toNumber(r.balanceQty), expiryDate: r.expiryDate || null
    };
  }

  private mapTaeRow(r: any): any {
    return {
      slNo: this.toNumber(r.slNo), toolsAndEquipmentCode: this.toNumber(r.toolsAndEquipmentCode), stockQty: this.toNumber(r.stockQty),
      qty: this.toNumber(r.qty), unitCode: this.toNumber(r.unitCode), noOfDays: this.toNumber(r.noOfDays),
      issuedDate: r.issuedDate || null, returnDate: r.returnDate || null, conditionOfMachine: this.toNumber(r.conditionOfMachine),
      description: this.toText(r.description), docUpload: this.toText(r.docUpload) || null, expDate: r.expDate || null,
      balanceQty: this.toNumber(r.balanceQty), returnedQty: this.toNumber(r.returnedQty)
    };
  }

  private mapServiceRow(r: any): any {
    return {
      slNo: this.toNumber(r.slNo), code: this.toNumber(r.code), stockQty: this.toNumber(r.stockQty),
      qty: this.toNumber(r.qty), returnedQty: this.toNumber(r.returnedQty), unitCode: this.toNumber(r.unitCode),
      rate: this.toNumber(r.rate), amount: this.toNumber(r.amount), supplierCode: this.toNumber(r.supplierCode),
      remarks: this.toText(r.remarks), balanceQty: this.toNumber(r.balanceQty)
    };
  }

  private mapTaeHireRow(r: any): any {
    return {
      slNo: this.toNumber(r.slNo), toolsAndEquipmentCode: this.toNumber(r.toolsAndEquipmentCode), stockQty: this.toNumber(r.stockQty),
      qty: this.toNumber(r.qty), returnedQty: this.toNumber(r.returnedQty), unitCode: this.toNumber(r.unitCode),
      noOfDays: this.toNumber(r.noOfDays), issuedDate: r.issuedDate || null, returnDate: r.returnDate || null,
      rate: this.toNumber(r.rate), amount: this.toNumber(r.amount), supplierCode: this.toNumber(r.supplierCode),
      description: this.toText(r.description), docUpload: this.toText(r.docUpload) || null, expDate: r.expDate || null,
      balanceQty: this.toNumber(r.balanceQty)
    };
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

    this.approvalService.getStatus(this.moduleCode, this.matReturnCode).subscribe({
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
    this.approvalService.verify(FORM_CLASS_NAME, this.matReturnCode).subscribe({
      next: async ({ count }) => {
        if (count > 0) {
          if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
          this.approvalService.clearActions(FORM_CLASS_NAME, this.matReturnCode, this.moduleCode).subscribe({
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
    this.service.delete(this.matReturnCode, this.settings.branchCode(), this.settings.companyCode()).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.router.navigate(['/resource-return']);
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not delete the record.'); }
    });
  }

  cancel(): void { this.router.navigate(['/resource-return']); }

  print(): void {
    const a = document.createElement('a');
    a.href = `/resource-return/${this.matReturnCode}/print`;
    a.target = '_blank';
    a.click();
  }

  // ---------- Helpers ----------
  private toDateInputValue(value: unknown): string {
    if (!value) return '';
    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    // MatReturnDate/IssuedDate etc. come back as dd/MM/yyyy strings from several SPs (CONVERT ..., 103).
    const dmy = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : '';
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
