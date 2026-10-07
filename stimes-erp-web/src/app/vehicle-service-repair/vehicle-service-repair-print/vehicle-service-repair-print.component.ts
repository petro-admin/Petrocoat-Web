import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { VehicleServiceRepairService } from '../services/vehicle-service-repair.service';
import { ApprovalService } from '../../core/services/approval.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.VehicleServiceRepair';

@Component({
  selector: 'app-vehicle-service-repair-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './vehicle-service-repair-print.component.html',
  styleUrl: './vehicle-service-repair-print.component.scss'
})
export class VehicleServiceRepairPrintComponent implements OnInit {
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  header = signal<any>({});
  items = signal<any[]>([]);
  documents = signal<any[]>([]);

  // Prepared By / Approved By - pulled from the generic approval/action-status subsystem
  // (usp_admin_GetActionStatus's CreatedUser/LastApprovedUser), not from VSR's own header table.
  preparedByName = signal<string>('');
  approvedByName = signal<string>('');

  itemsTotal = computed(() =>
    this.items().reduce((sum, row) => sum + this.toNumber(this.rowValue(row, 'Amount')), 0)
  );

  // Each item row prices its own VAT - there is no single document-level rate, so the total is a
  // sum of each row's own VAT Amount, not itemsTotal() times one shared percentage.
  vatAmount = computed(() =>
    this.round2(this.items().reduce((sum, row) => sum + this.toNumber(this.rowValue(row, 'VatAmount')), 0))
  );
  totalAmountWithVat = computed(() => this.round2(this.itemsTotal() + this.vatAmount()));

  rowTotalAmount(row: any): number {
    return this.round2(this.toNumber(this.rowValue(row, 'Amount')) + this.toNumber(this.rowValue(row, 'VatAmount')));
  }
  discountAmount = computed(() => this.toNumber(this.rowValue(this.header(), 'DiscountAmount')));
  netAmount = computed(() => this.round2(this.totalAmountWithVat() - this.discountAmount()));

  constructor(
    private route: ActivatedRoute,
    private service: VehicleServiceRepairService,
    private approvalService: ApprovalService,
    private titleService: Title
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.service.getById(id).subscribe({
      next: res => {
        this.header.set(res?.Header ?? res?.header ?? {});
        // Only priced items are shown - the Repair/Service Items grid auto-fills from the
        // vehicle's full inspection checklist, most of which stays at Amount 0 until the
        // mechanic actually prices a repair, and those unpriced rows shouldn't clutter the report.
        //
        // VatAmount is recomputed here rather than trusted as stored - a record saved before
        // per-item VAT existed has VatPercent defaulted to 5 by the DB but VatAmount stuck at 0
        // (never actually derived from it) until someone reopens and resaves it through the
        // detail form, so this keeps the print/export in sync even for records that haven't been
        // touched since.
        this.items.set((res?.Items ?? res?.items ?? [])
          .filter((r: any) => this.toNumber(this.rowValue(r, 'Amount')) > 0)
          .map((r: any) => ({ ...r, VatAmount: this.round2(this.toNumber(this.rowValue(r, 'Amount')) * this.toNumber(this.rowValue(r, 'VatPercent')) / 100) })));
        this.documents.set(res?.Documents ?? res?.documents ?? []);
        this.loading.set(false);

        // Chrome's "Save as PDF" print destination suggests the page's own <title> as the
        // default filename - without this, it inherits the app shell's generic title instead
        // of anything identifying this record.
        this.titleService.setTitle(this.reportFileName());
      },
      error: () => { this.errorMessage.set('Could not load the record.'); this.loading.set(false); }
    });

    this.approvalService.getSettings(FORM_CLASS_NAME).subscribe({
      next: settings => {
        if (!settings.moduleCode) return;
        this.approvalService.getStatus(settings.moduleCode, id).subscribe({
          next: status => {
            this.preparedByName.set(this.rowValue(status.action, 'CreatedUser') ?? '');
            this.approvedByName.set(this.rowValue(status.action, 'LastApprovedUser') ?? '');
          },
          error: () => {}
        });
      },
      error: () => {}
    });
  }

  print(): void {
    window.print();
  }

  // Matches the Service Type on the record: "Repair" -> Repair only, "Service" -> Service only,
  // "Both" (Repair & Service) keeps the combined heading. Used for both the on-screen title and
  // the downloaded file name.
  reportTitle(): string {
    const serviceType = this.toText(this.rowValue(this.header(), 'ServiceType')).toUpperCase();
    if (serviceType === 'SERVICE') return 'VEHICLE SERVICE REPORT';
    if (serviceType === 'REPAIR') return 'VEHICLE REPAIR REPORT';
    return 'VEHICLE SERVICE / REPAIR REPORT';
  }

  private reportFileName(): string {
    const docNo = this.toText(this.rowValue(this.header(), 'DocNo'));
    const title = this.reportTitle().split('/').map(s => s.trim()).join(' ');
    return (docNo ? `${docNo} ` : '') + title;
  }

  async downloadExcel(): Promise<void> {
    const XLSX = await import('xlsx');
    const header = this.header();
    const headerRows: [string, any][] = [
      ['Doc No', this.rowValue(header, 'DocNo')],
      ['Date', this.formatDate(this.rowValue(header, 'DocDate'))],
      ['Vehicle', [this.rowValue(header, 'RegistrationNo'), this.rowValue(header, 'VehicleModel')].filter(Boolean).join(' - ')],
      ['Service Type', this.rowValue(header, 'ServiceType')],
      ['Driver', this.rowValue(header, 'DriverName') || this.rowValue(header, 'EmpFullName')],
      ['Status', this.headerStatusLabel()],
      ['Current KM', this.rowValue(header, 'CurrentKM')],
      ['Next Service KM', this.rowValue(header, 'NextServiceKM')],
      ['Service/Repair Date', this.formatDate(this.rowValue(header, 'ServiceDate'))],
      ['Next Service Due Date', this.formatDate(this.rowValue(header, 'NextServiceDueDate'))],
      ['Completed Date', this.formatDate(this.rowValue(header, 'CompletedDate'))],
      ['Active', this.rowValue(header, 'Active') === 'N' ? 'No' : 'Yes'],
      ['Remarks', this.rowValue(header, 'Remarks')],
      ['VAT Amount', this.vatAmount()],
      ['Total Amount', this.totalAmountWithVat()],
      ['Discount Amount', this.discountAmount()],
      ['Net Amount', this.netAmount()],
      ['Prepared By', this.preparedByName()],
      ['Approved By', this.approvedByName()]
    ];

    const itemRows = this.items().map((row, index) => ({
      'Sl No': index + 1,
      'Description': this.rowValue(row, 'Description'),
      'Qty': this.rowValue(row, 'Qty'),
      'Rate': this.rowValue(row, 'Rate'),
      'Amount': this.rowValue(row, 'Amount'),
      'VAT %': this.rowValue(row, 'VatPercent'),
      'VAT Amount': this.rowValue(row, 'VatAmount'),
      'Total Amount': this.rowTotalAmount(row),
      'Status': this.statusLabel(row),
      'Remarks': this.rowValue(row, 'Remarks')
    }));
    itemRows.push({ 'Sl No': '' as any, Description: '', Qty: '' as any, Rate: '' as any, Amount: this.itemsTotal(), 'VAT %': '' as any, 'VAT Amount': this.vatAmount(), 'Total Amount': this.totalAmountWithVat(), Status: '', Remarks: 'Total' as any });

    const documentRows = this.documents().map(row => ({
      'Sl No': this.rowValue(row, 'SlNo'),
      'Description': this.rowValue(row, 'Description'),
      'Remarks': this.rowValue(row, 'Remarks'),
      'File': this.rowValue(row, 'DocUpload') ? 'Attached' : '-'
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(headerRows), 'Header');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(itemRows), 'Repair-Service Items');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documentRows), 'Documents');

    XLSX.writeFile(workbook, `${this.reportFileName()}.xlsx`);
  }

  private formatDate(value: unknown): string {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value);
  }

  private toText(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  rowValue(record: any, ...keys: string[]): any {
    for (const key of keys) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (record?.[key] !== undefined) return record[key];
      if (record?.[camelKey] !== undefined) return record[camelKey];
    }
    return undefined;
  }

  statusLabel(row: any): string {
    return this.toNumber(this.rowValue(row, 'StatusCode')) === 2 ? 'Closed' : 'Open';
  }

  headerStatusLabel(): string {
    return this.toNumber(this.rowValue(this.header(), 'StatusCode')) === 2 ? 'Completed' : 'Open';
  }

  // Matches the detail form: Next Service KM/Due Date only apply when Service is involved
  // (Service or Repair & Service), not for a plain Repair.
  isRepairOnly(): boolean {
    return this.toText(this.rowValue(this.header(), 'ServiceType')).toUpperCase() === 'REPAIR';
  }

  private toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
