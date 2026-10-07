import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { DsrTimeSheetService } from '../services/dsr-time-sheet.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService } from '../../core/services/user-rights.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Payroll_System.DSRDailyTimeSheet';

@Component({
  selector: 'app-dsr-time-sheet-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dsr-time-sheet-print.component.html',
  styleUrl: './dsr-time-sheet-print.component.scss'
})
export class DsrTimeSheetPrintComponent implements OnInit {
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  header = signal<any>({});
  lines = signal<any[]>([]);
  jobSummary = signal<any[]>([]);
  attendanceStatuses = signal<any[]>([]);

  preparedByName = signal<string>('');
  approvedByName = signal<string>('');

  totals = computed(() => {
    const rows = this.lines();
    const sum = (key: string) => rows.reduce((s, r) => s + this.toNumber(this.rowValue(r, key)), 0);
    return { actualHrs: sum('ActualHrs'), basic: sum('Basic'), ot1: sum('OT1'), ot2: sum('OT2'), paid: sum('Paid'), idle: sum('IDLE') };
  });

  // Same category grouping the main detail grid uses, instead of a plain "Category" column -
  // matches the on-screen grid exactly rather than just listing the value per row.
  private readonly categoryOrder = ['PC Labour', 'PTS Labour', 'GRAVITAS Labour', 'PC Driver', 'PTS Driver', 'GRAVITAS Driver', 'SubContract'];
  groupedLines = computed(() => {
    const groups = new Map<string, any[]>();
    for (const row of this.lines()) {
      const key = this.rowValue(row, 'Category') || '(Uncategorized)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries())
      .sort((a, b) => this.categoryOrder.indexOf(a[0]) - this.categoryOrder.indexOf(b[0]))
      .map(([category, rows]) => ({ category, rows }));
  });

  constructor(
    private route: ActivatedRoute,
    private service: DsrTimeSheetService,
    private approvalService: ApprovalService,
    private userRightsService: UserRightsService,
    private titleService: Title
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.service.getById(id).subscribe({
      next: res => {
        this.header.set(res?.Header ?? res?.header ?? {});
        this.lines.set(res?.Lines ?? res?.lines ?? []);
        this.jobSummary.set(res?.JobSummary ?? res?.jobSummary ?? []);
        this.loading.set(false);
        this.titleService.setTitle(this.reportFileName());
      },
      error: () => { this.errorMessage.set('Could not load this DSR Time Sheet.'); this.loading.set(false); }
    });

    this.service.getAttendanceStatuses().subscribe({ next: rows => this.attendanceStatuses.set(rows ?? []), error: () => {} });

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

  statusLabel(code: unknown): string {
    const n = this.toNumber(code);
    const match = this.attendanceStatuses().find(s => this.toNumber(this.rowValue(s, 'AttStatusCode')) === n);
    return match ? this.rowValue(match, 'AttStatusDesc') : String(code ?? '');
  }

  // Matches the desktop's own row background colors (2=Absent red, 4=Holiday yellow, 7=Idle blue,
  // 8=Vacation orange) - same mapping and same classes as the main detail grid's rowClass().
  rowClass(code: unknown): string {
    const n = this.toNumber(code);
    if (n === 2) return 'row-absent';
    if (n === 4) return 'row-holiday';
    if (n === 7) return 'row-idle';
    if (n === 8) return 'row-vacation';
    return 'row-present';
  }

  // ARGB fills for the Excel export - same colors as rowClass()'s CSS, just hex-with-alpha for
  // exceljs's cell.fill.
  private rowFillArgb(code: unknown): string | null {
    const n = this.toNumber(code);
    if (n === 2) return 'FFFDE1E1';
    if (n === 4) return 'FFFDF2B8';
    if (n === 7) return 'FFDCEEFB';
    if (n === 8) return 'FFFDE4D1';
    return null;
  }

  private reportFileName(): string {
    const dsrNumber = this.toText(this.rowValue(this.header(), 'DSRNumber'));
    return (dsrNumber ? `${dsrNumber} ` : '') + 'DSR TIME SHEET';
  }

  // Uses exceljs instead of the plain xlsx library - xlsx (SheetJS Community Edition) can't write
  // cell colors into the output file at all (silently ignored), so it can't reproduce the
  // Absent/Holiday/Idle/Vacation row colors the print view and main grid both show. Same
  // category grouping as the print table too, instead of a flat "Category" column.
  async downloadExcel(): Promise<void> {
    // esbuild's CJS interop for exceljs sometimes nests the real module under .default rather
    // than exposing Workbook directly on the namespace - this works with either shape, while
    // keeping the module's real types (unlike casting the whole module to `any`).
    const ExcelJS = await import('exceljs');
    const WorkbookCtor = (ExcelJS.Workbook ?? (ExcelJS as any).default?.Workbook) as typeof ExcelJS.Workbook;
    const workbook = new WorkbookCtor();

    const header = this.header();
    const headerSheet = workbook.addWorksheet('Header');
    headerSheet.columns = [{ width: 16 }, { width: 40 }];
    const headerRows: [string, any][] = [
      ['DSR Number', this.rowValue(header, 'DSRNumber')],
      ['Date', this.formatDate(this.rowValue(header, 'DSRDate'))],
      ['Branch', this.rowValue(header, 'BranchName')],
      ['Remarks', this.rowValue(header, 'Remarks')],
      ['Created By', this.rowValue(header, 'CreatedEmp')],
      ['Prepared By', this.preparedByName()],
      ['Approved By', this.approvedByName()]
    ];
    for (const row of headerRows) {
      const r = headerSheet.addRow(row);
      r.getCell(1).font = { bold: true };
    }

    const detailSheet = workbook.addWorksheet('DSR Details');
    const detailColumns = ['Sl No', 'Employee', 'Job No', 'Supervisor', 'Status', 'Actual Hrs', 'Basic', 'OT1', 'OT2', 'Paid', 'Idle'];
    detailSheet.columns = detailColumns.map(h => ({ header: h, width: Math.max(h.length + 2, 12) }));
    detailSheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3F8' } };
    });

    for (const group of this.groupedLines()) {
      const groupRow = detailSheet.addRow([group.category]);
      detailSheet.mergeCells(groupRow.number, 1, groupRow.number, detailColumns.length);
      groupRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17435C' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      });

      for (const row of group.rows) {
        const dataRow = detailSheet.addRow([
          this.rowValue(row, 'SlNo'),
          this.rowValue(row, 'EmpFullName'),
          this.rowValue(row, 'SoNo'),
          this.rowValue(row, 'Supervisor'),
          this.statusLabel(this.rowValue(row, 'AttStatusCode')),
          this.rowValue(row, 'ActualHrs'),
          this.rowValue(row, 'Basic'),
          this.rowValue(row, 'OT1'),
          this.rowValue(row, 'OT2'),
          this.rowValue(row, 'Paid'),
          this.rowValue(row, 'IDLE')
        ]);
        const fill = this.rowFillArgb(this.rowValue(row, 'AttStatusCode'));
        if (fill) dataRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; });
      }
    }

    const t = this.totals();
    const totalRow = detailSheet.addRow(['', 'Total', '', '', '', t.actualHrs, t.basic, t.ot1, t.ot2, t.paid, t.idle]);
    totalRow.eachCell(cell => { cell.font = { bold: true }; });

    const jobSheet = workbook.addWorksheet('Job-wise Summary');
    const jobColumns = ['Sl No', 'Job No', 'Actual Hrs', 'Basic', 'OT', 'Paid', 'Idle'];
    jobSheet.columns = jobColumns.map(h => ({ header: h, width: Math.max(h.length + 2, 12) }));
    jobSheet.getRow(1).font = { bold: true };
    for (const row of this.jobSummary()) {
      jobSheet.addRow([
        this.rowValue(row, 'SlNo'),
        this.rowValue(row, 'SoNo'),
        this.rowValue(row, 'ActualHrs'),
        this.rowValue(row, 'Basic'),
        this.rowValue(row, 'OT'),
        this.rowValue(row, 'Paid'),
        this.rowValue(row, 'Idle')
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.reportFileName()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  private formatDate(value: unknown): string {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value);
  }

  private toText(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  rowValue(record: any, ...keys: string[]): any {
    for (const key of keys) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (record?.[key] !== undefined) return record[key];
      if (record?.[camelKey] !== undefined) return record[camelKey];
    }
    return undefined;
  }
}
