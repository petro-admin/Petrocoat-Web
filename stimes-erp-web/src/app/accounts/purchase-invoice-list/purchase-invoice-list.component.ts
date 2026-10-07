import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.PurchaseInvoice';

@Component({
  selector: 'app-purchase-invoice-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './purchase-invoice-list.component.html',
  styleUrl: './purchase-invoice-list.component.scss'
})
export class PurchaseInvoiceListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);
  searchText = signal('');

  filteredRows = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(this.read(row, 'InvoiceNo') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'SupplierName') ?? '').toLowerCase().includes(term));
  });

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private service: AccountService,
    private settings: SettingsService,
    private router: Router,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {
    effect(() => {
      if (this.settings.branchCode()) this.refresh();
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.loadRights();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getPurchaseInvoiceList(this.settings.branchCode()).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load Purchase Invoices.'); this.loading.set(false); }
    });
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/accounts/purchase-invoice/0']);
  }

  open(row: any): void {
    this.router.navigate(['/accounts/purchase-invoice', this.read(row, 'Code')]);
  }

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();
    const code = this.toNumber(this.read(row, 'Code'));
    if (!code) return;

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete this Purchase Invoice ?'))) return;

    this.deleting.set(true);
    this.service.deletePurchaseInvoice(code).subscribe({
      next: (res: any) => {
        this.deleting.set(false);
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.refresh();
      },
      error: () => { this.deleting.set(false); this.errorMessage.set('Could not delete this Purchase Invoice.'); }
    });
  }

  outstanding(row: any): number {
    return this.round2(this.toNumber(this.read(row, 'TotalAmount')) - this.toNumber(this.read(row, 'PaidAmount')));
  }

  status(row: any): string {
    const outstanding = this.outstanding(row);
    const paid = this.toNumber(this.read(row, 'PaidAmount'));
    if (outstanding <= 0.001) return 'Paid';
    if (paid > 0) return 'Partially Paid';
    return 'Open';
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
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
