import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { FilterSelectComponent } from '../../shared/filter-select/filter-select.component';

// Cash-in-Hand group (see the 27-row Tally Standard Group seed in WebAccountGroup) - the "Petty
// Cash" header picker is scoped to this same group Payment Voucher's own Cash method uses, since
// there is no dedicated "Petty Cash" account group on the desktop or in WebAccountGroup.
const CASH_GROUP_CODES = [23];

@Component({
  selector: 'app-petty-cash-payment-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FilterSelectComponent],
  templateUrl: './petty-cash-payment-detail.component.html',
  styleUrl: './petty-cash-payment-detail.component.scss'
})
export class PettyCashPaymentDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;
  voucherType = 'PettyCashPayment';
  pageTitle = 'Petty Cash Payments';
  formClassName = 'Stimes.Erp.App.Win.Accounts.PettyCashPayment';
  listRoute = '/accounts/petty-cash-payment';

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  heads = signal<any[]>([]);
  headOptions = computed(() => this.heads().map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') })));
  paidFromOptions = computed(() => this.heads()
    .filter(h => CASH_GROUP_CODES.includes(this.toNumber(this.read(h, 'GroupCode'))))
    .map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') })));

  costCenters = signal<any[]>([]);
  costCenterOptions = computed(() => this.costCenters().map(c => ({ value: this.toNumber(this.read(c, 'Code')), label: this.read(c, 'CostCenterName') })));
  salesOrders = signal<any[]>([]);
  salesOrderOptions = computed(() => this.salesOrders().map(s => ({ value: this.toNumber(this.read(s, 'SOCode')), label: this.read(s, 'SONo') })));
  suppliers = signal<any[]>([]);
  supplierOptions = computed(() => this.suppliers().map(s => ({
    value: this.toNumber(this.read(s, 'SupplierCode')),
    label: this.read(s, 'SupplierName')
  })));

  currencyShortName = signal('');
  formatAmount(value: unknown): string {
    return this.toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  documents = signal<{ slNo: number; fileName: string; filePath: string }[]>([]);
  uploadingDocument = signal(false);
  uploadingLineAttachment = signal<number | null>(null);

  get lines(): FormArray { return this.form.get('lines') as FormArray; }

  // Each line's own Total is Amount + Vat Amount - the actual cash going out for that expense,
  // which is also what's posted as that line's DebitAmount (see save()).
  lineTotal(line: any): number {
    return this.round2(this.toNumber(line.amount) + (line.vatApplicable ? this.toNumber(line.vatAmount) : 0));
  }

  private lineValuesSignal = signal<any[]>([]);
  private lineValues(): any[] { return this.lineValuesSignal(); }
  grandTotal = computed(() => this.round2(this.lineValues().reduce((sum, l) => sum + this.lineTotal(l), 0)));

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: AccountService,
    private settings: SettingsService,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {
    this.form = this.fb.group({
      voucherNo: [{ value: '', disabled: true }],
      voucherDate: ['', Validators.required],
      pettyCashMode: ['Direct'],
      paidFromCode: [null, Validators.required],
      lines: this.fb.array([])
    });

    effect(() => {
      const branchCode = this.settings.branchCode();
      if (!branchCode) return;
      this.service.getHeads(branchCode).subscribe({ next: rows => this.heads.set(rows ?? []), error: () => {} });
      this.service.getCostCenters(branchCode).subscribe({ next: rows => this.costCenters.set(rows ?? []), error: () => {} });
      this.service.getSuppliers(branchCode).subscribe({ next: rows => this.suppliers.set(rows ?? []), error: () => {} });
      this.service.getCurrency(branchCode).subscribe({
        next: res => this.currencyShortName.set(this.read(res, 'CurrShortName') ?? ''),
        error: () => this.currencyShortName.set('')
      });
    }, { allowSignalWrites: true });

    this.service.getSalesOrders().subscribe({ next: rows => this.salesOrders.set(rows ?? []), error: () => {} });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.code === 0;
    this.loadRights();

    if (this.isNew) {
      this.form.patchValue({ voucherDate: this.today() });
      this.regenerateVoucherNo();
      this.addLine();
    } else {
      this.loadExisting();
    }

    this.lines.valueChanges.subscribe(values => this.lineValuesSignal.set(values));
  }

  setMode(mode: 'Direct' | 'Request'): void {
    this.form.patchValue({ pettyCashMode: mode });
  }

  private regenerateVoucherNo(): void {
    this.service.generateVoucherNo(this.voucherType).subscribe({
      next: res => this.form.patchValue({ voucherNo: res?.voucherNo ?? '' })
    });
  }

  private loadRights(): void {
    this.userRightsService.getRights(this.formClassName).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getVoucherById(this.code).subscribe({
      next: res => {
        const header = this.read(res, 'Header') ?? res;
        const lineRows: any[] = this.read(res, 'Lines') ?? [];
        // The single Credit line is the "Petty Cash" paid-from account - every Debit line is an
        // expense line, same Dr/Cr convention Payment Voucher's own save() writes out.
        const fromLine = lineRows.find(l => this.toNumber(this.read(l, 'CreditAmount')) > 0);
        const expenseLines = lineRows.filter(l => this.toNumber(this.read(l, 'DebitAmount')) > 0);

        this.form.patchValue({
          voucherNo: this.read(header, 'VoucherNo') ?? '',
          voucherDate: this.toDateOnly(this.read(header, 'VoucherDate')),
          pettyCashMode: this.read(header, 'PettyCashMode') || 'Direct',
          paidFromCode: fromLine ? this.toNumber(this.read(fromLine, 'AccountHeadCode')) : null
        });

        this.lines.clear();
        for (const line of expenseLines) this.addLine(line);
        if (this.lines.length === 0) this.addLine();
        this.lineValuesSignal.set(this.lines.value);

        this.documents.set((this.read(res, 'Documents') ?? []).map((d: any) => ({
          slNo: this.toNumber(this.read(d, 'SlNo')),
          fileName: this.read(d, 'FileName') ?? '',
          filePath: this.read(d, 'FilePath') ?? ''
        })));

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set(`Could not load this ${this.pageTitle} voucher.`); this.loading.set(false); }
    });
  }

  addLine(data?: any): void {
    this.lines.push(this.fb.group({
      lineDate: [this.toDateOnly(this.read(data, 'LineDate')) || this.today()],
      referenceNo: [this.toText(this.read(data, 'ReferenceNo'))],
      projectSoCode: [this.read(data, 'ProjectSoCode') ?? null],
      accountHeadCode: [this.read(data, 'AccountHeadCode') ?? null],
      narration: [this.toText(this.read(data, 'Narration'))],
      costCenterCode: [this.read(data, 'CostCenterCode') ?? null],
      supplierCode: [this.read(data, 'SupplierCode') ?? null],
      trn: [this.toText(this.read(data, 'Trn'))],
      amount: [this.read(data, 'DebitAmount') != null ? this.toNumber(this.read(data, 'DebitAmount')) - this.toNumber(this.read(data, 'VatAmount')) : null],
      vatApplicable: [!!this.read(data, 'VatApplicable')],
      vatAmount: [this.read(data, 'VatAmount') ?? null],
      attachmentPath: [this.read(data, 'AttachmentPath') ?? null],
      attachmentName: [this.fileNameOf(this.toText(this.read(data, 'AttachmentPath')))]
    }));
    this.lineValuesSignal.set(this.lines.value);
  }

  removeLine(index: number): void {
    this.lines.removeAt(index);
    this.lineValuesSignal.set(this.lines.value);
  }

  onLineAttachmentSelected(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingLineAttachment.set(index);
    this.service.uploadDocument(file, this.settings.branchCode()).subscribe({
      next: res => {
        this.lines.at(index).patchValue({ attachmentPath: res.fileName, attachmentName: res.originalName });
        this.lineValuesSignal.set(this.lines.value);
        this.uploadingLineAttachment.set(null);
        input.value = '';
      },
      error: () => {
        this.uploadingLineAttachment.set(null);
        this.errorMessage.set('Could not upload the attachment.');
        input.value = '';
      }
    });
  }

  viewLineAttachment(index: number): void {
    const path = this.lines.at(index).get('attachmentPath')?.value;
    if (!path) return;
    this.service.getDocumentBlob(path).subscribe({
      next: blob => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.errorMessage.set('Could not open this attachment.')
    });
  }

  onDocumentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingDocument.set(true);
    this.service.uploadDocument(file, this.settings.branchCode()).subscribe({
      next: res => {
        this.documents.update(list => [...list, { slNo: list.length + 1, fileName: res.originalName, filePath: res.fileName }]);
        this.uploadingDocument.set(false);
        input.value = '';
      },
      error: () => {
        this.uploadingDocument.set(false);
        this.errorMessage.set('Could not upload the document.');
        input.value = '';
      }
    });
  }

  removeDocument(index: number): void {
    this.documents.update(list => list.filter((_, i) => i !== index).map((d, i) => ({ ...d, slNo: i + 1 })));
  }

  viewDocument(doc: { filePath: string }): void {
    this.service.getDocumentBlob(doc.filePath).subscribe({
      next: blob => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.errorMessage.set('Could not open this document.')
    });
  }

  save(): void {
    const allowed = this.isNew ? this.rights().add : this.rights().edit;
    if (!allowed) {
      this.errorMessage.set(`You do not have permission to ${this.isNew ? 'add' : 'edit'} this record.`);
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set(`Please fill in Date and ${this.paidFromLabel}.`);
      return;
    }

    const validLines = this.lines.value.filter((l: any) => this.toNumber(l.accountHeadCode) > 0 && this.toNumber(l.amount) > 0);
    if (validLines.length === 0) {
      this.errorMessage.set('Please add at least one expense line with an amount.');
      return;
    }

    const v = this.form.getRawValue();
    const total = this.grandTotal();
    let slNo = 1;
    const expenseLines = validLines.map((l: any) => ({
      slNo: slNo++,
      accountHeadCode: this.toNumber(l.accountHeadCode),
      debitAmount: this.round2(this.toNumber(l.amount) + (l.vatApplicable ? this.toNumber(l.vatAmount) : 0)),
      creditAmount: 0,
      costCenterCode: this.toNumber(l.costCenterCode) > 0 ? this.toNumber(l.costCenterCode) : null,
      narration: this.toText(l.narration),
      referenceNo: this.toText(l.referenceNo),
      projectSoCode: this.toNumber(l.projectSoCode) > 0 ? this.toNumber(l.projectSoCode) : null,
      vatApplicable: !!l.vatApplicable,
      vatAmount: l.vatApplicable ? this.toNumber(l.vatAmount) : 0,
      supplierCode: this.toNumber(l.supplierCode) > 0 ? this.toNumber(l.supplierCode) : null,
      trn: this.toText(l.trn),
      attachmentPath: l.attachmentPath || null,
      lineDate: l.lineDate || null
    }));

    const payload = {
      code: this.code,
      voucherNo: this.toText(v.voucherNo),
      voucherDate: v.voucherDate,
      voucherType: this.voucherType,
      pettyCashMode: v.pettyCashMode,
      branchCode: this.settings.branchCode(),
      lines: [
        { slNo: 0, accountHeadCode: this.toNumber(v.paidFromCode), debitAmount: 0, creditAmount: total },
        ...expenseLines
      ],
      documents: this.documents().map(d => ({ slNo: d.slNo, fileName: d.fileName, filePath: d.filePath }))
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.saveVoucher(payload).subscribe({
      next: async (res: any) => {
        this.saving.set(false);
        if (res?.code) {
          await this.confirmDialog.notify(res?.result || `${this.pageTitle} saved successfully.`);
          this.router.navigate([this.listRoute]);
        } else {
          this.errorMessage.set(res?.result || `Could not save this ${this.pageTitle}.`);
        }
      },
      error: () => { this.saving.set(false); this.errorMessage.set(`Could not save this ${this.pageTitle}.`); }
    });
  }

  get paidFromLabel(): string { return 'Petty Cash'; }

  cancel(): void {
    this.router.navigate([this.listRoute]);
  }

  private today(): string {
    const processingDate = this.settings.processingDate() ?? new Date();
    return processingDate.toISOString().substring(0, 10);
  }

  private toDateOnly(value: unknown): string {
    if (!value) return '';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private fileNameOf(path: string): string {
    if (!path) return '';
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] ?? path;
  }

  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  toText(value: unknown): string {
    return value == null ? '' : String(value);
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
