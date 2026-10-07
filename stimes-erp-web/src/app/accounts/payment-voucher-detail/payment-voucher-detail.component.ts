import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { FilterSelectComponent } from '../../shared/filter-select/filter-select.component';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.PaymentVoucher';

// Bank Accounts / Cash-in-Hand groups (see the 27-row Tally Standard Group seed in WebAccountGroup).
const CASH_GROUP_CODES = [23];
const BANK_GROUP_CODES = [22];

// The company's actual primary Cash/Bank accounts, the same ones used by default on the desktop's
// own Payment screen - every branch has exactly one of each, so a new Payment defaults straight to
// it instead of forcing a manual search every time (the user can still pick a different one).
const DEFAULT_CASH_NAME_PATTERN = /basu\s*cash/i;
const DEFAULT_BANK_NAME_PATTERN = /rak\s*bank/i;

// Narrows the "Paid To" picker by account category - "Supplier" is the common case, "General
// Ledger" (unfiltered) covers everything else (expenses paid directly, asset purchases, etc.).
const LEDGER_TYPE_GROUPS: Record<string, number[] | null> = {
  'General Ledger': null,
  'Supplier': [21]
};
const LEDGER_TYPES = Object.keys(LEDGER_TYPE_GROUPS);

@Component({
  selector: 'app-payment-voucher-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FilterSelectComponent],
  templateUrl: './payment-voucher-detail.component.html',
  styleUrl: './payment-voucher-detail.component.scss'
})
export class PaymentVoucherDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  heads = signal<any[]>([]);
  // "Paid From" is scoped by the selected payment method - Cash-in-Hand for Cash, Bank Accounts
  // for Bank and Cheque (a cheque is always drawn against a bank account).
  paidFromOptions = computed(() => {
    const groupCodes = this.paymentMethod() === 'Cash' ? CASH_GROUP_CODES : BANK_GROUP_CODES;
    return this.heads()
      .filter(h => groupCodes.includes(this.toNumber(this.read(h, 'GroupCode'))))
      .map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') }));
  });
  headOptions = computed(() => this.heads().map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') })));

  // Sourced from the desktop's real Supplier Master (purchaseSupplierInfo), not just Account Heads
  // filtered by group - so the picker shows actual vendor names. The dropdown's own value is the
  // real desktop SupplierCode (needed to look up that supplier's real outstanding bills from
  // purchasePurchaseInvoiceHdr) - AccountHeadCode (for posting) is resolved from this same list.
  suppliers = signal<any[]>([]);
  supplierOptions = computed(() => this.suppliers().map(s => ({
    value: this.toNumber(this.read(s, 'SupplierCode')),
    label: this.read(s, 'SupplierName')
  })));

  ledgerTypes = LEDGER_TYPES;
  ledgerType = signal('General Ledger');
  // Bank is the common case for this company's payments (Cash is the exception), so a new voucher
  // opens on Bank rather than Cash.
  paymentMethod = signal<'Cash' | 'Bank' | 'Cheque'>('Bank');
  // Account Details grid stays plain - just Account Heads filtered by group. Picking a real
  // Supplier (below) is a separate, standalone action that auto-adds its own line.
  filteredHeadOptions = computed(() => {
    const groupCodes = LEDGER_TYPE_GROUPS[this.ledgerType()];
    if (!groupCodes) return this.headOptions();
    return this.heads()
      .filter(h => groupCodes.includes(this.toNumber(this.read(h, 'GroupCode'))))
      .map(h => ({ value: this.toNumber(this.read(h, 'Code')), label: this.read(h, 'HeadName') }));
  });

  costCenters = signal<any[]>([]);
  costCenterOptions = computed(() => this.costCenters().map(c => ({ value: this.toNumber(this.read(c, 'Code')), label: this.read(c, 'CostCenterName') })));

  // Branch's own currency short name (AED/INR/...), shown next to each line's amount.
  currencyShortName = signal('');

  // Account Details' amount column shows a formatted "AED 3,885.00" display by default (matching
  // the reference layout) and only switches to a plain editable number box for whichever single
  // row is actively being edited - so typing works normally without comma-formatting fighting it.
  editingAmountIndex = signal<number | null>(null);
  formatAmount(value: unknown): string {
    return this.toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Ledger Type "Supplier" - the grid holds exactly the one auto-added Supplier line, shown as a
  // read-only name (not a re-pickable dropdown - the header Supplier picker is the only way to
  // change who this voucher pays) and no Cost Center (that's an expense-line concept, not
  // something a payable/receivable control account itself gets tagged with), no "+ Add Line"
  // either since this mode isn't meant to hold more than the one party line.
  accountHeadName(accountHeadCode: number | null): string {
    const match = this.headOptions().find(o => o.value === accountHeadCode);
    return match ? match.label : '';
  }

  // Live balance of the selected Paid From account - matches the "Balance" field shown next to
  // Account on the desktop's own Payment screen.
  paidFromBalance = signal<{ balance: number; drCr: string } | null>(null);

  get lines(): FormArray { return this.form.get('lines') as FormArray; }

  totalAmount = computed(() => this.round2(this.lineValues().reduce((sum, l) => sum + this.toNumber(l.amount), 0)));

  private lineValuesSignal = signal<any[]>([]);
  private lineValues(): any[] { return this.lineValuesSignal(); }

  // Which grid line the header Supplier picker itself owns - so picking a NEW supplier swaps
  // that same line over rather than leaving the old supplier's line behind and adding another.
  // Not private - the template reads it directly to show that line's open invoices in their own
  // standalone "Account Invoice Details" section, rather than nested per-row inside Account Details.
  supplierLineIndex: number | null = null;

  // Bill-by-bill allocation (Tally's "Against Reference" / Odoo's "Match Bills"): once a line's
  // Paid To account is picked, its open Purchase Invoices (if any) are fetched here so the amount
  // can be allocated against specific bills instead of just landing "on account".
  openInvoicesByLine = signal<Record<number, any[]>>({});
  expandedBillLines = signal<Set<number>>(new Set());
  allocationsByLine = signal<Record<number, Record<number, number>>>({});
  existingAllocations = signal<any[]>([]); // read-only, shown when editing an already-saved payment
  private pendingReconcile = signal<{ lines: any[]; allocations: any[] } | null>(null);

  documents = signal<{ slNo: number; fileName: string; filePath: string }[]>([]);
  uploadingDocument = signal(false);

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
      paidFromCode: [null, Validators.required],
      chequeNo: [''],
      chequeDate: [''],
      supplierPicker: [null],
      narration: [''],
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

    // Auto-picks the company's actual primary account for whatever method is selected (Basu Cash
    // for Cash, Rak Bank for Bank/Cheque) as soon as it's known and nothing else has been chosen
    // yet - fires both on a brand-new voucher's initial load (once heads() arrives) and whenever
    // the method is switched via setPaymentMethod() (which clears paidFromCode first). Guarded
    // purely by "paidFromCode is still empty" rather than isNew, so re-opening a saved voucher is
    // never affected (loadExisting() patches its own real saved account in first).
    effect(() => {
      const options = this.paidFromOptions();
      if (options.length === 0) return;
      if (this.form.get('paidFromCode')?.value) return;
      const code = this.defaultPaidFromCode();
      if (code != null) {
        this.form.patchValue({ paidFromCode: code });
        this.onPaidFromChange(code);
      }
    }, { allowSignalWrites: true });

    // Reconciling a reopened voucher's ticked invoices needs the Supplier list resolved first (to
    // map each line's account back to a real desktop SupplierCode) - that list loads asynchronously
    // above, independently of loadExisting()'s own request, so this waits for both rather than
    // racing them.
    effect(() => {
      const pending = this.pendingReconcile();
      if (!pending || this.suppliers().length === 0) return;

      // If EVERY party line on this voucher is a real desktop Supplier, restore the Ledger Type to
      // "Supplier" and pre-fill the Supplier picker with that same supplier (shown but locked -
      // reopening a voucher should show exactly who it was entered against, not let that be
      // changed out from under an already-saved allocation). A mixed voucher with a non-supplier
      // line stays on General Ledger so that line's account still resolves in the grid dropdown.
      const lineSuppliers = pending.lines.map(line =>
        this.suppliers().find(s => this.toNumber(this.read(s, 'AccountHeadCode')) === this.toNumber(this.read(line, 'AccountHeadCode'))));
      const supplier = pending.lines.length > 0 && lineSuppliers.every(s => !!s) ? lineSuppliers[0] : null;
      if (supplier) {
        this.ledgerType.set('Supplier');
        const picker = this.form.get('supplierPicker');
        picker?.setValue(this.toNumber(this.read(supplier, 'SupplierCode')), { emitEvent: false });
        picker?.disable({ emitEvent: false });
        // Without this, the standalone "Account Invoice Details" card (which only renders once
        // supplierLineIndex is set) never appears on a reopened voucher - only onSupplierPicked()
        // used to set it, which never runs here since the picker is restored programmatically.
        this.supplierLineIndex = 0;
      }

      this.reconcileAllocations(pending.lines, pending.allocations);
      this.pendingReconcile.set(null);
    }, { allowSignalWrites: true });
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

  // Switching method changes which accounts are valid "Paid From" candidates, so the previously
  // selected one (from a different group) is cleared rather than left stale/invalid.
  setPaymentMethod(method: 'Cash' | 'Bank' | 'Cheque'): void {
    this.paymentMethod.set(method);
    this.form.patchValue({ paidFromCode: null });
    this.paidFromBalance.set(null);
    if (method !== 'Cheque') this.form.patchValue({ chequeNo: '', chequeDate: '' });
  }

  onPaidFromChange(accountHeadCode: number | null): void {
    if (!accountHeadCode) { this.paidFromBalance.set(null); return; }
    this.service.getHeadBalance(accountHeadCode).subscribe({
      next: res => this.paidFromBalance.set(res),
      error: () => this.paidFromBalance.set(null)
    });
  }

  // Cash -> "Basu Cash", Bank/Cheque -> "Rak Bank" - the company's real primary accounts, matched
  // by name (a "lowest Code in group" heuristic was tried first but doesn't hold consistently
  // across branches - e.g. branch 3's Rak Bank has the HIGHEST code of its 3 bank accounts).
  private defaultPaidFromCode(): number | null {
    const pattern = this.paymentMethod() === 'Cash' ? DEFAULT_CASH_NAME_PATTERN : DEFAULT_BANK_NAME_PATTERN;
    const match = this.paidFromOptions().find(o => pattern.test(String(o.label)));
    return match ? match.value : null;
  }

  private regenerateVoucherNo(): void {
    this.service.generateVoucherNo('Payment').subscribe({
      next: res => this.form.patchValue({ voucherNo: res?.voucherNo ?? '' })
    });
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  // Reconstructs the simplified Paid-From/Paid-To view from the raw Dr/Cr lines a Payment voucher
  // was saved as: the single Credit line is always the "Paid From" bank/cash account, and every
  // Debit line is a "Paid To" party line - same convention this screen's save() writes out.
  private loadExisting(): void {
    this.loading.set(true);
    this.service.getVoucherById(this.code).subscribe({
      next: res => {
        const header = this.read(res, 'Header') ?? res;
        const lineRows: any[] = this.read(res, 'Lines') ?? [];
        const fromLine = lineRows.find(l => this.toNumber(this.read(l, 'CreditAmount')) > 0);
        const partyLines = lineRows.filter(l => this.toNumber(this.read(l, 'DebitAmount')) > 0);

        const method = this.read(header, 'PaymentMethod') || 'Cash';
        this.paymentMethod.set(method === 'Bank' || method === 'Cheque' ? method : 'Cash');

        this.form.patchValue({
          voucherNo: this.read(header, 'VoucherNo') ?? '',
          voucherDate: this.toDateOnly(this.read(header, 'VoucherDate')),
          paidFromCode: fromLine ? this.toNumber(this.read(fromLine, 'AccountHeadCode')) : null,
          chequeNo: this.read(header, 'ChequeNo') ?? '',
          chequeDate: this.toDateOnly(this.read(header, 'ChequeDate')),
          narration: this.read(header, 'Narration') ?? ''
        });
        if (fromLine) this.onPaidFromChange(this.toNumber(this.read(fromLine, 'AccountHeadCode')));

        this.lines.clear();
        for (const line of partyLines) {
          this.lines.push(this.fb.group({
            accountHeadCode: [this.toNumber(this.read(line, 'AccountHeadCode'))],
            amount: [this.toNumber(this.read(line, 'DebitAmount'))],
            costCenterCode: [this.read(line, 'CostCenterCode') ?? null],
            narration: [this.toText(this.read(line, 'Narration'))]
          }));
        }
        if (this.lines.length === 0) this.addLine();
        this.lineValuesSignal.set(this.lines.value);
        const allocations = this.read(res, 'Allocations') ?? [];
        this.existingAllocations.set(allocations);
        this.pendingReconcile.set({ lines: partyLines, allocations });
        this.documents.set((this.read(res, 'Documents') ?? []).map((d: any) => ({
          slNo: this.toNumber(this.read(d, 'SlNo')),
          fileName: this.read(d, 'FileName') ?? '',
          filePath: this.read(d, 'FilePath') ?? ''
        })));
        // Existing lines can reference any account, not just Suppliers - keep the picker unfiltered
        // here so every already-saved line's name still resolves, rather than showing blank.
        this.ledgerType.set('General Ledger');

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this Payment voucher.'); this.loading.set(false); }
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

  // Standalone "Supplier" picker in the header (separate from the Account Details grid) - picking
  // a real supplier there auto-adds (or reuses) their line in the grid and immediately fetches and
  // expands their outstanding Purchase Invoices (from the desktop's own real records), ready to
  // allocate this payment against.
  onSupplierPicked(supplierCode: number | null): void {
    if (!supplierCode) return;
    const supplier = this.suppliers().find(s => this.toNumber(this.read(s, 'SupplierCode')) === supplierCode);
    if (!supplier) return;
    const accountHeadCode = this.toNumber(this.read(supplier, 'AccountHeadCode'));

    // A line already showing this exact supplier - just reuse it (picking the same one again).
    const existingIndex = this.lines.controls.findIndex(
      line => this.toNumber(line.get('accountHeadCode')?.value) === accountHeadCode);

    let index: number;
    if (existingIndex >= 0) {
      index = existingIndex;
      this.supplierLineIndex = index;
    } else if (this.supplierLineIndex != null && this.supplierLineIndex < this.lines.length) {
      // Swap the picker's OWN previously-set line over to the newly picked supplier, instead of
      // leaving the old supplier's line sitting in the grid and adding a second one next to it.
      index = this.supplierLineIndex;
      this.lines.at(index).patchValue({ accountHeadCode });
      this.lineValuesSignal.set(this.lines.value);
    } else {
      // First pick this session - reuse an already-blank line (e.g. the initial starter row)
      // instead of always appending a new one underneath it.
      const blankIndex = this.lines.controls.findIndex(
        line => !this.toNumber(line.get('accountHeadCode')?.value) && !this.toNumber(line.get('amount')?.value));
      index = blankIndex >= 0 ? blankIndex : this.lines.length;
      if (blankIndex < 0) this.addLine();
      this.lines.at(index).patchValue({ accountHeadCode });
      this.lineValuesSignal.set(this.lines.value);
      this.supplierLineIndex = index;
    }

    this.onPaidToChange(index, accountHeadCode);
    this.expandedBillLines.update(set => new Set(set).add(index));
    // Keep showing the picked supplier's name in the field (rather than clearing it back to blank)
    // so it's clear which supplier you're currently working with.
  }

  removeLine(index: number): void {
    this.lines.removeAt(index);
    this.lineValuesSignal.set(this.lines.value);
    this.reindexAfterRemoval(index);
    if (this.supplierLineIndex === index) this.supplierLineIndex = null;
    else if (this.supplierLineIndex != null && this.supplierLineIndex > index) this.supplierLineIndex--;
  }

  // Re-key the per-line allocation/open-invoice maps down by one after a line is removed, so a
  // later line's allocations don't end up attached to the wrong row.
  private reindexAfterRemoval(removedIndex: number): void {
    const shiftDown = (map: Record<number, any>) => {
      const next: Record<number, any> = {};
      for (const key of Object.keys(map)) {
        const i = Number(key);
        if (i < removedIndex) next[i] = map[i];
        else if (i > removedIndex) next[i - 1] = map[i];
      }
      return next;
    };
    this.openInvoicesByLine.set(shiftDown(this.openInvoicesByLine()));
    this.allocationsByLine.set(shiftDown(this.allocationsByLine()));
    const expanded = new Set<number>();
    this.expandedBillLines().forEach(i => {
      if (i < removedIndex) expanded.add(i);
      else if (i > removedIndex) expanded.add(i - 1);
    });
    this.expandedBillLines.set(expanded);
  }

  // Fired when a line's Paid To account changes - fetches that supplier's open bills, if any, so
  // the amount can be allocated against them instead of just landing "on account". This voucher's
  // own prior allocations are always excluded from "already paid" (excludeVoucherCode), so re-
  // opening an existing Payment for editing still shows the invoices it settled, ready to re-tick,
  // instead of them vanishing because they now show zero outstanding.
  onPaidToChange(index: number, accountHeadCode: number | null, onLoaded?: (rows: any[]) => void): void {
    const openMap = { ...this.openInvoicesByLine() };
    delete openMap[index];
    this.openInvoicesByLine.set(openMap);

    const allocMap = { ...this.allocationsByLine() };
    delete allocMap[index];
    this.allocationsByLine.set(allocMap);

    if (!accountHeadCode) return;
    // Resolve which real desktop supplier (if any) this account belongs to - a non-supplier account
    // (e.g. an expense paid directly) simply has no bills to fetch.
    const supplier = this.suppliers().find(s => this.toNumber(this.read(s, 'AccountHeadCode')) === accountHeadCode);
    if (!supplier) return;
    const supplierCode = this.toNumber(this.read(supplier, 'SupplierCode'));

    this.service.getOpenPurchaseInvoices(supplierCode, this.settings.branchCode(), this.code).subscribe({
      next: rows => {
        const next = { ...this.openInvoicesByLine() };
        next[index] = rows ?? [];
        this.openInvoicesByLine.set(next);
        onLoaded?.(rows ?? []);
      },
      error: () => {}
    });
  }

  // Reconstructs each reopened line's ticked invoices exactly as they were when this voucher was
  // originally saved. Fetches each line's full open-bills list purely to resolve invoice details
  // (its own prior allocation excluded from "already paid", so a fully-settled invoice can still be
  // matched), then narrows the Bills panel down to ONLY the invoice(s) this voucher actually
  // allocated against - reopening a saved voucher should show what it paid, not the whole ledger of
  // outstanding bills for that supplier.
  private reconcileAllocations(partyLines: any[], allocations: any[]): void {
    partyLines.forEach((line, index) => {
      const accountHeadCode = this.toNumber(this.read(line, 'AccountHeadCode'));
      this.onPaidToChange(index, accountHeadCode, rows => {
        const lineAllocMap: Record<number, number> = {};
        for (const alloc of allocations) {
          const invoiceCode = this.toNumber(this.read(alloc, 'InvoiceHdrCode'));
          const row = rows.find(r => this.toNumber(this.read(r, 'Code')) === invoiceCode);
          if (row) {
            lineAllocMap[invoiceCode] = this.toNumber(this.read(alloc, 'AllocatedAmount'));
          }
        }
        const allocatedRows = rows.filter(r => this.toNumber(this.read(r, 'Code')) in lineAllocMap);
        const openMap = { ...this.openInvoicesByLine() };
        openMap[index] = allocatedRows;
        this.openInvoicesByLine.set(openMap);

        if (Object.keys(lineAllocMap).length > 0) {
          const next = { ...this.allocationsByLine() };
          next[index] = lineAllocMap;
          this.allocationsByLine.set(next);
          this.expandedBillLines.update(set => new Set(set).add(index));
        }
      });
    });
  }

  hasOpenBills(index: number): boolean {
    return (this.openInvoicesByLine()[index]?.length ?? 0) > 0;
  }

  openBillsFor(index: number): any[] {
    return this.openInvoicesByLine()[index] ?? [];
  }

  toggleBills(index: number): void {
    const next = new Set(this.expandedBillLines());
    if (next.has(index)) next.delete(index); else next.add(index);
    this.expandedBillLines.set(next);
  }

  billsExpanded(index: number): boolean {
    return this.expandedBillLines().has(index);
  }

  isAllocated(index: number, invoice: any): boolean {
    const invoiceCode = this.toNumber(this.read(invoice, 'Code'));
    return this.allocationsByLine()[index]?.[invoiceCode] !== undefined;
  }

  allocationAmount(index: number, invoice: any): number {
    const invoiceCode = this.toNumber(this.read(invoice, 'Code'));
    return this.allocationsByLine()[index]?.[invoiceCode] ?? 0;
  }

  lineAllocatedTotal(index: number): number {
    const map = this.allocationsByLine()[index] ?? {};
    return this.round2(Object.values(map).reduce((sum, v) => sum + this.toNumber(v), 0));
  }

  toggleAllocation(index: number, invoice: any): void {
    const invoiceCode = this.toNumber(this.read(invoice, 'Code'));
    const next = { ...this.allocationsByLine() };
    const lineMap = { ...(next[index] ?? {}) };

    if (lineMap[invoiceCode] !== undefined) {
      delete lineMap[invoiceCode];
    } else {
      const outstanding = this.toNumber(this.read(invoice, 'Outstanding'));
      const lineAmount = this.toNumber(this.lines.at(index)?.get('amount')?.value);
      const remaining = this.round2(Math.max(0, lineAmount - this.lineAllocatedTotal(index)));
      lineMap[invoiceCode] = this.round2(remaining > 0 ? Math.min(outstanding, remaining) : outstanding);
    }

    next[index] = lineMap;
    this.allocationsByLine.set(next);
    this.syncLineAmountToAllocations(index);
  }

  allTickedForLine(index: number): boolean {
    const bills = this.openBillsFor(index);
    if (bills.length === 0) return false;
    const map = this.allocationsByLine()[index] ?? {};
    return bills.every(b => map[this.toNumber(this.read(b, 'Code'))] !== undefined);
  }

  toggleAllForLine(index: number): void {
    const bills = this.openBillsFor(index);
    const next = { ...this.allocationsByLine() };
    if (this.allTickedForLine(index)) {
      next[index] = {};
    } else {
      const lineMap: Record<number, number> = {};
      for (const b of bills) lineMap[this.toNumber(this.read(b, 'Code'))] = this.toNumber(this.read(b, 'Outstanding'));
      next[index] = lineMap;
    }
    this.allocationsByLine.set(next);
    this.syncLineAmountToAllocations(index);
  }

  setAllocationAmount(index: number, invoice: any, amount: string): void {
    const invoiceCode = this.toNumber(this.read(invoice, 'Code'));
    const next = { ...this.allocationsByLine() };
    const lineMap = { ...(next[index] ?? {}) };
    lineMap[invoiceCode] = this.toNumber(amount);
    next[index] = lineMap;
    this.allocationsByLine.set(next);
    this.syncLineAmountToAllocations(index);
  }

  // Ticking/adjusting a bill "fills" the line's Payment amount to match, so picking a supplier and
  // checking their invoices is enough on its own - no separate manual amount entry required.
  private syncLineAmountToAllocations(index: number): void {
    const line = this.lines.at(index);
    if (!line) return;
    line.get('amount')?.setValue(this.lineAllocatedTotal(index));
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
    if (this.form.get('paidFromCode')?.invalid) {
      this.errorMessage.set('Please select the account paid from.');
      return;
    }
    if (this.paymentMethod() === 'Cheque' && !this.form.get('chequeNo')?.value) {
      this.errorMessage.set('Please enter the Cheque No.');
      return;
    }

    const v = this.form.getRawValue();
    const indexedPartyLines = (v.lines ?? [])
      .map((l: any, i: number) => ({ l, i }))
      .filter(({ l }: any) => this.toNumber(l.accountHeadCode) > 0 && this.toNumber(l.amount) > 0);
    if (indexedPartyLines.length === 0) {
      this.errorMessage.set('Please add at least one Paid To line with an amount.');
      return;
    }

    const total = this.round2(indexedPartyLines.reduce((sum: number, { l }: any) => sum + this.toNumber(l.amount), 0));

    const allocations: any[] = [];
    indexedPartyLines.forEach(({ i }: any) => {
      const map = this.allocationsByLine()[i] ?? {};
      for (const [invoiceCode, amount] of Object.entries(map)) {
        if (this.toNumber(amount) > 0) {
          allocations.push({ invoiceType: 'DesktopPurchase', invoiceHdrCode: Number(invoiceCode), allocatedAmount: this.toNumber(amount) });
        }
      }
    });

    const payload = {
      code: this.code,
      voucherNo: this.toText(v.voucherNo),
      voucherDate: v.voucherDate,
      voucherType: 'Payment',
      narration: this.toText(v.narration),
      branchCode: this.settings.branchCode(),
      lines: [
        ...indexedPartyLines.map(({ l }: any, i: number) => ({
          slNo: i + 1,
          accountHeadCode: this.toNumber(l.accountHeadCode),
          debitAmount: this.toNumber(l.amount),
          creditAmount: 0,
          costCenterCode: this.toNumber(l.costCenterCode) > 0 ? this.toNumber(l.costCenterCode) : null,
          narration: this.toText(l.narration)
        })),
        {
          slNo: indexedPartyLines.length + 1,
          accountHeadCode: this.toNumber(v.paidFromCode),
          debitAmount: 0,
          creditAmount: total,
          costCenterCode: null,
          narration: ''
        }
      ],
      allocations,
      paymentMethod: this.paymentMethod(),
      chequeNo: this.paymentMethod() === 'Cheque' ? this.toText(v.chequeNo) : null,
      chequeDate: this.paymentMethod() === 'Cheque' && v.chequeDate ? v.chequeDate : null,
      documents: this.documents().map(d => ({ slNo: d.slNo, fileName: d.fileName, filePath: d.filePath }))
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.saveVoucher(payload).subscribe({
      next: async (res: any) => {
        this.saving.set(false);
        if (res?.code) {
          await this.confirmDialog.notify(res?.result || 'Payment saved successfully.');
          this.router.navigate(['/accounts/payment']);
        } else {
          this.errorMessage.set(res?.result || 'Could not save this Payment voucher.');
        }
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this Payment voucher.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/accounts/payment']);
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
