import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialExpiryReportService } from '../services/material-expiry-report.service';
import { SettingsService } from '../../core/services/settings.service';
import { exportRowsToExcel } from '../../shared/excel-export';

const EXPIRY_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'expired', label: 'Already Expired' },
  { value: 'today', label: 'Expiring Today' },
  { value: '7days', label: 'Expiring in 7 Days' },
  { value: '30days', label: 'Expiring in 30 Days' },
  { value: 'later', label: 'Expiring Later' }
];

@Component({
  selector: 'app-material-expiry-report-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './material-expiry-report-list.component.html',
  styleUrl: './material-expiry-report-list.component.scss'
})
export class MaterialExpiryReportListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  warehouses = signal<any[]>([]);
  matCategories = signal<any[]>([]);
  materials = signal<any[]>([]);
  suppliers = signal<any[]>([]);
  expiryStatusOptions = EXPIRY_STATUS_OPTIONS;

  fromDate = signal('');
  toDate = signal('');
  branchCode = signal(0);
  warehouse = signal('');
  itemCode = signal('');
  matCategory = signal('');
  supplier = signal('');
  expiryStatus = signal('');

  materialDisplayText = signal('');

  constructor(
    private service: MaterialExpiryReportService,
    public settings: SettingsService
  ) {}

  ngOnInit(): void {
    this.service.getWarehouses().subscribe({ next: rows => this.warehouses.set(rows ?? []), error: () => {} });
    this.service.getMaterialCategories().subscribe({ next: rows => this.matCategories.set(rows ?? []), error: () => {} });
    this.service.getMaterials().subscribe({ next: rows => this.materials.set(rows ?? []), error: () => {} });
    this.service.getSuppliers().subscribe({ next: rows => this.suppliers.set(rows ?? []), error: () => {} });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getList({
      fromDate: this.fromDate() || undefined,
      toDate: this.toDate() || undefined,
      // 0 = All Branches - the default, matching every other branch filter in this app.
      branchCode: this.branchCode() || undefined,
      warehouse: this.warehouse() || undefined,
      itemCode: this.itemCode() || undefined,
      matCategory: this.matCategory() || undefined,
      supplier: this.supplier() || undefined,
      expiryStatus: this.expiryStatus() || undefined
    }).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load the Material Expiry Report.'); this.loading.set(false); }
    });
  }

  clearFilters(): void {
    this.fromDate.set('');
    this.toDate.set('');
    this.branchCode.set(0);
    this.warehouse.set('');
    this.itemCode.set('');
    this.materialDisplayText.set('');
    this.matCategory.set('');
    this.supplier.set('');
    this.expiryStatus.set('');
    this.load();
  }

  // Same pattern as Daily Site's Sales Order field: a text input + <datalist>, resolved back
  // to the real code by matching the typed text against the option list's own display strings.
  onMaterialTextChanged(value: string): void {
    this.materialDisplayText.set(value);
    const match = this.materials().find(m =>
      `${this.read(m, 'ItemCode')} - ${this.read(m, 'Description')}`.trim().toLowerCase() === value.trim().toLowerCase());
    this.itemCode.set(match ? this.read(match, 'ItemCode') : '');
  }

  // Same pattern as Trip Sheet Report's own Print button - native browser print, with the filter
  // row hidden and the table un-clipped via @media print CSS. Covers PDF too: every browser's
  // print dialog offers "Save as PDF" as a destination, so no separate PDF generation is needed.
  print(): void {
    window.print();
  }

  exporting = signal(false);

  async exportToExcel(): Promise<void> {
    if (this.rows().length === 0) return;
    this.exporting.set(true);
    try {
      const columns = [
        { header: 'Material Code', key: 'materialCode', width: 18 },
        { header: 'Material Name', key: 'materialName', width: 40 },
        { header: 'Batch No', key: 'batchNo', width: 18 },
        { header: 'Warehouse', key: 'warehouse', width: 22 },
        { header: 'Stock Qty', key: 'stockQty', width: 14, numFmt: '#,##0.00' },
        { header: 'Unit', key: 'unit', width: 12 },
        { header: 'Expiry Date', key: 'expiryDate', width: 16 },
        { header: 'Days to Expire', key: 'daysToExpire', width: 16 },
        { header: 'Status', key: 'status', width: 20 }
      ];
      const data = this.rows().map(row => ({
        materialCode: this.read(row, 'MaterialCode'),
        materialName: this.read(row, 'MaterialName'),
        batchNo: this.read(row, 'BatchNo') || '-',
        warehouse: this.read(row, 'WareHouseName') || '-',
        stockQty: this.toNumber(this.read(row, 'Qty')),
        unit: this.read(row, 'Unit'),
        expiryDate: this.read(row, 'ExpiryDate') ? new Date(this.read(row, 'ExpiryDate')).toLocaleDateString('en-GB') : '',
        daysToExpire: this.read(row, 'DaysToExpire'),
        status: this.read(row, 'Status')
      }));
      await exportRowsToExcel('Material Expiry Report', 'Material Expiry Report', columns, data);
    } finally {
      this.exporting.set(false);
    }
  }

  statusClass(status: string): string {
    if (status === 'Expired') return 'status-expired';
    if (status === 'Expiring Today' || status === 'Expiring Soon') return 'status-soon';
    if (status === 'Expiring in 30 Days') return 'status-warning';
    return 'status-ok';
  }

  toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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
