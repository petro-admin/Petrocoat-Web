import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { FilterSelectComponent } from '../../shared/filter-select/filter-select.component';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.PurchaseInvoice';

// Sundry Creditors group (see the 27-row Tally Standard Group seed in WebAccountGroup) - the
// Supplier on a Purchase Invoice is always one of these.
const SUPPLIER_GROUP_CODES = [21];

@Component({
  selector: 'app-purchase-invoice-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FilterSelectComponent],
  templateUrl: './purchase-invoice-detail.component.html',
  styleUrl: './purchase-invoice-detail.component.scss'
})
export class PurchaseInvoiceDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  heads = signal<any[]>([]);
  supplierOptions = computed(() =>
    this.heads()
      .filter(h => SUPPLIER_GROUP_CODES.includes(this.toNumber(this.read(h, 'GroupCode'))))
      .map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') })));
  headOptions = computed(() => this.heads().map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') })));

  costCenters = signal<any[]>([]);
  costCenterOptions = computed(() => this.costCenters().map(c => ({ value: this.toNumber(this.read(c, 'Code')), label: this.read(c, 'CostCenterName') })));

  get lines(): FormArray { return this.form.get('lines') as FormArray; }

  totalAmount = computed(() => this.round2(this.lineValues().reduce((sum, l) => sum + this.toNumber(l.amount), 0)));

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
    this.form = this.fb.group({
      invoiceNo: [{ value: '', disabled: true }],
      invoiceDate: ['', Validators.required],
      dueDate: [''],
      supplierCode: [null, Validators.required],
      narration: [''],
      lines: this.fb.array([])
    });

    effect(() => {
      const branchCode = this.settings.branchCode();
      if (!branchCode) return;
      this.service.getHeads(branchCode).subscribe({ next: rows => this.heads.set(rows ?? []), error: () => {} });
      this.service.getCostCenters(branchCode).subscribe({ next: rows => this.costCenters.set(rows ?? []), error: () => {} });
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.code === 0;
    this.loadRights();

    if (this.isNew) {
      this.form.patchValue({ invoiceDate: this.today() });
      this.regenerateInvoiceNo();
      this.addLine();
    } else {
      this.loadExisting();
    }

    this.lines.valueChanges.subscribe(values => this.lineValuesSignal.set(values));
  }

  private regenerateInvoiceNo(): void {
    this.service.generatePurchaseInvoiceNo().subscribe({
      next: res => this.form.patchValue({ invoiceNo: res?.invoiceNo ?? '' })
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
    this.service.getPurchaseInvoiceById(this.code).subscribe({
      next: res => {
        const header = this.read(res, 'Header') ?? res;
        const lineRows: any[] = this.read(res, 'Lines') ?? [];

        this.form.patchValue({
          invoiceNo: this.read(header, 'InvoiceNo') ?? '',
          invoiceDate: this.toDateOnly(this.read(header, 'InvoiceDate')),
          dueDate: this.toDateOnly(this.read(header, 'DueDate')),
          supplierCode: this.toNumber(this.read(header, 'SupplierCode')),
          narration: this.read(header, 'Narration') ?? ''
        });

        this.lines.clear();
        for (const line of lineRows) {
          this.lines.push(this.fb.group({
            accountHeadCode: [this.toNumber(this.read(line, 'AccountHeadCode'))],
            amount: [this.toNumber(this.read(line, 'Amount'))],
            costCenterCode: [this.read(line, 'CostCenterCode') ?? null],
            narration: [this.toText(this.read(line, 'Narration'))]
          }));
        }
        if (this.lines.length === 0) this.addLine();
        this.lineValuesSignal.set(this.lines.value);

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this Purchase Invoice.'); this.loading.set(false); }
    });
  }

  addLine(): void {
    this.lines.push(this.fb.group({
      accountHeadCode: [null],
      amount: [null],
      costCenterCode: [null],
      narration: ['']
    }));
    this.lineValuesSignal.set(this.lines.value);
  }

  removeLine(index: number): void {
    this.lines.removeAt(index);
    this.lineValuesSignal.set(this.lines.value);
  }

  save(): void {
    const allowed = this.isNew ? this.rights().add : this.rights().edit;
    if (!allowed) {
      this.errorMessage.set(`You do not have permission to ${this.isNew ? 'add' : 'edit'} this record.`);
      return;
    }

    if (this.form.get('invoiceDate')?.invalid) {
      this.errorMessage.set('Please enter the Invoice Date.');
      return;
    }
    if (this.form.get('supplierCode')?.invalid) {
      this.errorMessage.set('Please select the Supplier.');
      return;
    }

    const v = this.form.getRawValue();
    const purchaseLines = (v.lines ?? []).filter((l: any) => this.toNumber(l.accountHeadCode) > 0 && this.toNumber(l.amount) > 0);
    if (purchaseLines.length === 0) {
      this.errorMessage.set('Please add at least one line with an amount.');
      return;
    }

    const payload = {
      code: this.code,
      invoiceNo: this.toText(v.invoiceNo),
      invoiceDate: v.invoiceDate,
      dueDate: v.dueDate || null,
      supplierCode: this.toNumber(v.supplierCode),
      narration: this.toText(v.narration),
      branchCode: this.settings.branchCode(),
      lines: purchaseLines.map((l: any, i: number) => ({
        slNo: i + 1,
        accountHeadCode: this.toNumber(l.accountHeadCode),
        amount: this.toNumber(l.amount),
        costCenterCode: this.toNumber(l.costCenterCode) > 0 ? this.toNumber(l.costCenterCode) : null,
        narration: this.toText(l.narration)
      }))
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.savePurchaseInvoice(payload).subscribe({
      next: async (res: any) => {
        this.saving.set(false);
        if (res?.code) {
          await this.confirmDialog.notify(res?.result || 'Purchase Invoice saved successfully.');
          this.router.navigate(['/accounts/purchase-invoice']);
        } else {
          this.errorMessage.set(res?.result || 'Could not save this Purchase Invoice.');
        }
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this Purchase Invoice.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/accounts/purchase-invoice']);
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
