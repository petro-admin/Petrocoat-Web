import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { FilterSelectComponent } from '../../shared/filter-select/filter-select.component';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.ContraVoucher';

// Bank Accounts / Cash-in-Hand groups (see the 27-row Tally Standard Group seed in WebAccountGroup) -
// a Contra voucher only ever moves money between two of the company's own accounts in these groups.
const BANK_CASH_GROUP_CODES = [22, 23];

@Component({
  selector: 'app-contra-voucher-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FilterSelectComponent],
  templateUrl: './contra-voucher-detail.component.html',
  styleUrl: './contra-voucher-detail.component.scss'
})
export class ContraVoucherDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  heads = signal<any[]>([]);
  bankCashOptions = computed(() =>
    this.heads()
      .filter(h => BANK_CASH_GROUP_CODES.includes(this.toNumber(this.read(h, 'GroupCode'))))
      .map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') })));

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
      fromCode: [null, Validators.required],
      toCode: [null, Validators.required],
      amount: [null, [Validators.required, Validators.min(0.01)]],
      narration: ['']
    });

    effect(() => {
      const branchCode = this.settings.branchCode();
      if (!branchCode) return;
      this.service.getHeads(branchCode).subscribe({ next: rows => this.heads.set(rows ?? []), error: () => {} });
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.code === 0;
    this.loadRights();

    if (this.isNew) {
      this.form.patchValue({ voucherDate: this.today() });
      this.regenerateVoucherNo();
    } else {
      this.loadExisting();
    }
  }

  private regenerateVoucherNo(): void {
    this.service.generateVoucherNo('Contra').subscribe({
      next: res => this.form.patchValue({ voucherNo: res?.voucherNo ?? '' })
    });
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  // Reconstructs the From/To/Amount view from the raw Dr/Cr lines a Contra voucher was saved as:
  // the Debit line is always "To" and the Credit line is always "From" - same convention save() writes.
  private loadExisting(): void {
    this.loading.set(true);
    this.service.getVoucherById(this.code).subscribe({
      next: res => {
        const header = this.read(res, 'Header') ?? res;
        const lineRows: any[] = this.read(res, 'Lines') ?? [];
        const toLine = lineRows.find(l => this.toNumber(this.read(l, 'DebitAmount')) > 0);
        const fromLine = lineRows.find(l => this.toNumber(this.read(l, 'CreditAmount')) > 0);

        this.form.patchValue({
          voucherNo: this.read(header, 'VoucherNo') ?? '',
          voucherDate: this.toDateOnly(this.read(header, 'VoucherDate')),
          fromCode: fromLine ? this.toNumber(this.read(fromLine, 'AccountHeadCode')) : null,
          toCode: toLine ? this.toNumber(this.read(toLine, 'AccountHeadCode')) : null,
          amount: toLine ? this.toNumber(this.read(toLine, 'DebitAmount')) : null,
          narration: this.read(header, 'Narration') ?? ''
        });

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this Contra voucher.'); this.loading.set(false); }
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
      this.errorMessage.set('Please fill in Voucher Date, Transfer From, Transfer To, and Amount.');
      return;
    }

    const v = this.form.getRawValue();
    if (this.toNumber(v.fromCode) === this.toNumber(v.toCode)) {
      this.errorMessage.set('Transfer From and Transfer To must be different accounts.');
      return;
    }

    const amount = this.toNumber(v.amount);
    const payload = {
      code: this.code,
      voucherNo: this.toText(v.voucherNo),
      voucherDate: v.voucherDate,
      voucherType: 'Contra',
      narration: this.toText(v.narration),
      branchCode: this.settings.branchCode(),
      lines: [
        { slNo: 1, accountHeadCode: this.toNumber(v.toCode), debitAmount: amount, creditAmount: 0, costCenterCode: null, narration: '' },
        { slNo: 2, accountHeadCode: this.toNumber(v.fromCode), debitAmount: 0, creditAmount: amount, costCenterCode: null, narration: '' }
      ]
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.saveVoucher(payload).subscribe({
      next: async (res: any) => {
        this.saving.set(false);
        if (res?.code) {
          await this.confirmDialog.notify(res?.result || 'Contra saved successfully.');
          this.router.navigate(['/accounts/contra']);
        } else {
          this.errorMessage.set(res?.result || 'Could not save this Contra voucher.');
        }
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this Contra voucher.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/accounts/contra']);
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
