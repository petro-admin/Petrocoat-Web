import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { FilterSelectComponent } from '../../shared/filter-select/filter-select.component';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.VoucherEntry';

@Component({
  selector: 'app-voucher-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FilterSelectComponent],
  templateUrl: './voucher-detail.component.html',
  styleUrl: './voucher-detail.component.scss'
})
export class VoucherDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  heads = signal<any[]>([]);
  headOptions = computed(() => this.heads().map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') })));
  costCenters = signal<any[]>([]);
  costCenterOptions = computed(() => this.costCenters().map(c => ({ value: this.toNumber(this.read(c, 'Code')), label: this.read(c, 'CostCenterName') })));
  salesOrders = signal<any[]>([]);
  salesOrderOptions = computed(() => this.salesOrders().map(s => ({ value: this.toNumber(this.read(s, 'SOCode')), label: this.read(s, 'SONo') })));

  documents = signal<{ slNo: number; fileName: string; filePath: string }[]>([]);
  uploadingDocument = signal(false);

  // Branch's own currency short name (AED/INR/...), shown on the Total row.
  currencyShortName = signal('');
  formatAmount(value: unknown): string {
    return this.toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get lines(): FormArray { return this.form.get('lines') as FormArray; }

  totalDebit = computed(() => this.round2(this.lineValues().reduce((sum, l) => sum + this.toNumber(l.debitAmount), 0)));
  totalCredit = computed(() => this.round2(this.lineValues().reduce((sum, l) => sum + this.toNumber(l.creditAmount), 0)));
  isBalanced = computed(() => this.totalDebit() > 0 && this.totalDebit() === this.totalCredit());

  // Tracks the raw FormArray values as a signal so totalDebit/totalCredit recompute live as the
  // user types, without needing a manual (input) handler on every cell.
  private lineValuesSignal = signal<any[]>([]);
  private lineValues(): any[] { return this.lineValuesSignal(); }

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
    // Payment/Receipt/Contra now have their own dedicated, simplified entry screens - this generic
    // Dr/Cr grid is Journal-only from here on, so Voucher Type is fixed rather than user-selectable.
    this.form = this.fb.group({
      voucherNo: [{ value: '', disabled: true }],
      voucherDate: ['', Validators.required],
      voucherType: [{ value: 'Journal', disabled: true }],
      refNo: [''],
      narration: [''],
      lines: this.fb.array([])
    });

    // branchCode() starts at 0 until SettingsService's async load chain finishes (see
    // account-head-list.component.ts) - loading the Account Head/Cost Center dropdowns reactively
    // instead of once in ngOnInit means they still populate once the real branch is known.
    effect(() => {
      const branchCode = this.settings.branchCode();
      if (!branchCode) return;
      this.service.getHeads(branchCode).subscribe({ next: rows => this.heads.set(rows ?? []), error: () => {} });
      this.service.getCostCenters(branchCode).subscribe({ next: rows => this.costCenters.set(rows ?? []), error: () => {} });
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
      this.addLine();
    } else {
      this.loadExisting();
    }

    this.lines.valueChanges.subscribe(values => this.lineValuesSignal.set(values));
  }

  private regenerateVoucherNo(): void {
    if (!this.isNew) return;
    this.service.generateVoucherNo(this.form.get('voucherType')?.value).subscribe({
      next: res => this.form.patchValue({ voucherNo: res?.voucherNo ?? '' })
    });
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getVoucherById(this.code).subscribe({
      next: res => {
        const header = this.read(res, 'Header') ?? res;
        this.form.patchValue({
          voucherNo: this.read(header, 'VoucherNo') ?? '',
          voucherDate: this.toDateOnly(this.read(header, 'VoucherDate')),
          voucherType: this.read(header, 'VoucherType') ?? 'Journal',
          refNo: this.read(header, 'RefNo') ?? '',
          narration: this.read(header, 'Narration') ?? ''
        });

        this.lines.clear();
        const lineRows = this.read(res, 'Lines') ?? [];
        for (const line of lineRows) this.addLine(line);
        if (this.lines.length === 0) { this.addLine(); this.addLine(); }
        this.lineValuesSignal.set(this.lines.value);

        this.documents.set((this.read(res, 'Documents') ?? []).map((d: any) => ({
          slNo: this.toNumber(this.read(d, 'SlNo')),
          fileName: this.read(d, 'FileName') ?? '',
          filePath: this.read(d, 'FilePath') ?? ''
        })));

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this voucher.'); this.loading.set(false); }
    });
  }

  // Field/column order here matches the desktop's own Journal.xaml grid: Account, Project,
  // Cost Center, InvoiceNo (this screen's "referenceNo"), Narration, Debit, Credit.
  addLine(data?: any): void {
    this.lines.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.lines.length + 1],
      accountHeadCode: [this.read(data, 'AccountHeadCode') ?? null],
      projectSoCode: [this.read(data, 'ProjectSoCode') ?? null],
      costCenterCode: [this.read(data, 'CostCenterCode') ?? null],
      referenceNo: [this.toText(this.read(data, 'ReferenceNo'))],
      narration: [this.toText(this.read(data, 'Narration'))],
      debitAmount: [this.read(data, 'DebitAmount') ?? null],
      creditAmount: [this.read(data, 'CreditAmount') ?? null]
    }));
    this.lineValuesSignal.set(this.lines.value);
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

  removeLine(index: number): void {
    this.lines.removeAt(index);
    this.lines.controls.forEach((c, i) => c.patchValue({ slNo: i + 1 }, { emitEvent: false }));
    this.lineValuesSignal.set(this.lines.value);
  }

  save(): void {
    const allowed = this.isNew ? this.rights().add : this.rights().edit;
    if (!allowed) {
      this.errorMessage.set(`You do not have permission to ${this.isNew ? 'add' : 'edit'} this record.`);
      return;
    }

    if (this.form.get('voucherDate')?.invalid) {
      this.errorMessage.set('Please enter the Voucher Date.');
      return;
    }

    if (!this.isBalanced()) {
      this.errorMessage.set('Voucher is not balanced - total Debit must equal total Credit.');
      return;
    }

    const v = this.form.getRawValue();
    const payload = {
      code: this.code,
      voucherNo: this.toText(v.voucherNo),
      voucherDate: v.voucherDate,
      voucherType: v.voucherType,
      refNo: this.toText(v.refNo),
      narration: this.toText(v.narration),
      branchCode: this.settings.branchCode(),
      lines: (v.lines ?? [])
        .filter((l: any) => this.toNumber(l.accountHeadCode) > 0 && (this.toNumber(l.debitAmount) > 0 || this.toNumber(l.creditAmount) > 0))
        .map((l: any) => ({
          slNo: this.toNumber(l.slNo),
          accountHeadCode: this.toNumber(l.accountHeadCode),
          debitAmount: this.toNumber(l.debitAmount),
          creditAmount: this.toNumber(l.creditAmount),
          costCenterCode: this.toNumber(l.costCenterCode) > 0 ? this.toNumber(l.costCenterCode) : null,
          narration: this.toText(l.narration),
          referenceNo: this.toText(l.referenceNo),
          projectSoCode: this.toNumber(l.projectSoCode) > 0 ? this.toNumber(l.projectSoCode) : null
        })),
      documents: this.documents().map(d => ({ slNo: d.slNo, fileName: d.fileName, filePath: d.filePath }))
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.saveVoucher(payload).subscribe({
      next: async (res: any) => {
        this.saving.set(false);
        if (res?.code) {
          await this.confirmDialog.notify(res?.result || 'Voucher saved successfully.');
          this.router.navigate(['/accounts/voucher']);
        } else {
          this.errorMessage.set(res?.result || 'Could not save this voucher.');
        }
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this voucher.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/accounts/voucher']);
  }

  print(): void {
    const a = document.createElement('a');
    a.href = `/accounts/voucher/${this.code}/print`;
    a.target = '_blank';
    a.click();
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
