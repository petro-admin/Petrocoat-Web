import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { DsrTimeSheetService } from '../services/dsr-time-sheet.service';
import { ApprovalService } from '../../core/services/approval.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Payroll_System.DSRDailyTimeSheet';

interface DsrReport {
  header: any;
  lines: any[];
  jobSummary: any[];
  preparedByName: string;
  approvedByName: string;
  groupedLines: { category: string; rows: any[] }[];
  totals: { actualHrs: number; basic: number; ot1: number; ot2: number; paid: number; idle: number };
}

// Same category order / status colors as the single-record print page (dsr-time-sheet-print) -
// this exists purely so "Print Selected" on the list can produce one PDF/Excel covering several
// DSRs at once, since the single-print route only ever handles one. Loads each selected DSR one
// at a time with plain .subscribe() calls, deliberately mirroring the single-print page's own
// loading style exactly (no forkJoin/RxJS combinators) rather than fetching them all in parallel.
@Component({
  selector: 'app-dsr-time-sheet-print-multi',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dsr-time-sheet-print-multi.component.html',
  styleUrl: './dsr-time-sheet-print-multi.component.scss'
})
export class DsrTimeSheetPrintMultiComponent implements OnInit {
  loading = signal(true);
  errorMessage = signal<string | null>(null);
  reports = signal<DsrReport[]>([]);
  attendanceStatuses = signal<any[]>([]);

  private readonly categoryOrder = ['PC Labour', 'PTS Labour', 'GRAVITAS Labour', 'PC Driver', 'PTS Driver', 'GRAVITAS Driver', 'SubContract'];
  private ids: number[] = [];
  private approvalModuleCode = 0;
  private loadedReports: DsrReport[] = [];

  constructor(
    private route: ActivatedRoute,
    private service: DsrTimeSheetService,
    private approvalService: ApprovalService,
    private titleService: Title
  ) {}

  ngOnInit(): void {
    const idsParam = this.route.snapshot.queryParamMap.get('ids') ?? '';
    this.ids = idsParam.split(',').map(s => Number(s.trim())).filter(n => n > 0);

    if (this.ids.length === 0) {
      this.errorMessage.set('No DSR Time Sheets were selected.');
      this.loading.set(false);
      return;
    }

    this.titleService.setTitle(`DSR TIME SHEET (${this.ids.length} selected)`);
    this.service.getAttendanceStatuses().subscribe({ next: rows => this.attendanceStatuses.set(rows ?? []), error: () => {} });

    this.approvalService.getSettings(FORM_CLASS_NAME).subscribe({
      next: settings => { this.approvalModuleCode = settings?.moduleCode || 0; this.loadNext(0); },
      error: () => { this.approvalModuleCode = 0; this.loadNext(0); }
    });
  }

  // Loads DSR records one at a time (rather than all at once) - same plain per-record
  // .getById().subscribe() the single-print page uses, just called again for the next id once
  // the current one finishes, instead of firing every request together.
  private loadNext(index: number): void {
    if (index >= this.ids.length) {
      this.reports.set(this.loadedReports);
      this.loading.set(false);
      if (this.loadedReports.length === 0) this.errorMessage.set('Could not load any of the selected DSR Time Sheets.');
      return;
    }

    const id = this.ids[index];
    this.service.getById(id).subscribe({
      next: res => {
        const header = res?.Header ?? res?.header ?? {};
        const lines = res?.Lines ?? res?.lines ?? [];
        const jobSummary = res?.JobSummary ?? res?.jobSummary ?? [];
        const report: DsrReport = {
          header, lines, jobSummary,
          preparedByName: '', approvedByName: '',
          groupedLines: this.groupByCategory(lines),
          totals: this.computeTotals(lines)
        };
        this.loadedReports.push(report);

        if (this.approvalModuleCode) {
          this.approvalService.getStatus(this.approvalModuleCode, id).subscribe({
            next: status => {
              report.preparedByName = this.rowValue(status?.action, 'CreatedUser') ?? '';
              report.approvedByName = this.rowValue(status?.action, 'LastApprovedUser') ?? '';
              this.loadNext(index + 1);
            },
            error: () => this.loadNext(index + 1)
          });
        } else {
          this.loadNext(index + 1);
        }
      },
      // A single failed DSR doesn't stop the rest - skip it and keep going.
      error: () => this.loadNext(index + 1)
    });
  }

  private groupByCategory(lines: any[]): { category: string; rows: any[] }[] {
    const groups = new Map<string, any[]>();
    for (const row of lines) {
      const key = this.rowValue(row, 'Category') || '(Uncategorized)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries())
      .sort((a, b) => this.categoryOrder.indexOf(a[0]) - this.categoryOrder.indexOf(b[0]))
      .map(([category, rows]) => ({ category, rows }));
  }

  private computeTotals(lines: any[]): DsrReport['totals'] {
    const sum = (key: string) => lines.reduce((s, r) => s + this.toNumber(this.rowValue(r, key)), 0);
    return { actualHrs: sum('ActualHrs'), basic: sum('Basic'), ot1: sum('OT1'), ot2: sum('OT2'), paid: sum('Paid'), idle: sum('IDLE') };
  }

  print(): void {
    window.print();
  }

  statusLabel(code: unknown): string {
    const n = this.toNumber(code);
    const match = this.attendanceStatuses().find(s => this.toNumber(this.rowValue(s, 'AttStatusCode')) === n);
    return match ? this.rowValue(match, 'AttStatusDesc') : String(code ?? '');
  }

  rowClass(code: unknown): string {
    const n = this.toNumber(code);
    if (n === 2) return 'row-absent';
    if (n === 4) return 'row-holiday';
    if (n === 7) return 'row-idle';
    if (n === 8) return 'row-vacation';
    return 'row-present';
  }

  private rowFillArgb(code: unknown): string | null {
    const n = this.toNumber(code);
    if (n === 2) return 'FFFDE1E1';
    if (n === 4) return 'FFFDF2B8';
    if (n === 7) return 'FFDCEEFB';
    if (n === 8) return 'FFFDE4D1';
    return null;
  }

  async downloadExcel(): Promise<void> {
    // esbuild's CJS interop for exceljs sometimes nests the real module under .default rather
    // than exposing Workbook directly on the namespace - this works with either shape, while
    // keeping the module's real types (unlike casting the whole module to `any`).
    const ExcelJS = await import('exceljs');
    const WorkbookCtor = (ExcelJS.Workbook ?? (ExcelJS as any).default?.Workbook) as typeof ExcelJS.Workbook;
    const workbook = new WorkbookCtor();
    const detailColumns = ['Sl No', 'Employee', 'Job No', 'Supervisor', 'Status', 'Actual Hrs', 'Basic', 'OT1', 'OT2', 'Paid', 'Idle'];

    for (const report of this.reports()) {
      const dsrNumber = this.toText(this.rowValue(report.header, 'DSRNumber')) || 'DSR';
      // Sheet names can't exceed 31 chars or contain \ / ? * [ ] - DSR numbers are short so this
      // is mostly just the invalid-character guard.
      const sheetName = dsrNumber.replace(/[\\/?*[\]]/g, '-').slice(0, 31);
      const sheet = workbook.addWorksheet(sheetName);
      sheet.columns = detailColumns.map(h => ({ header: h, width: Math.max(h.length + 2, 12) }));

      // Header info block - same fields as the single-print export's own Header sheet, just
      // placed at the top of this DSR's own sheet instead of a separate shared one (there's no
      // single shared "header" when the workbook covers several different DSRs).
      const headerFields: [string, any][] = [
        ['DSR Number', dsrNumber],
        ['Date', this.formatDate(this.rowValue(report.header, 'DSRDate'))],
        ['Branch', this.rowValue(report.header, 'BranchName')],
        ['Remarks', this.rowValue(report.header, 'Remarks')],
        ['Created By', this.rowValue(report.header, 'CreatedEmp')],
        ['Prepared By', report.preparedByName],
        ['Approved By', report.approvedByName]
      ];
      for (const [label, value] of headerFields) {
        const row = sheet.addRow([label, value]);
        row.getCell(1).font = { bold: true };
      }
      sheet.addRow([]);

      const detailTitleRow = sheet.addRow(['DSR Time Sheet Details']);
      sheet.mergeCells(detailTitleRow.number, 1, detailTitleRow.number, detailColumns.length);
      detailTitleRow.font = { bold: true, size: 12 };

      const headerRow = sheet.addRow(detailColumns);
      headerRow.eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3F8' } };
      });

      for (const group of report.groupedLines) {
        const groupRow = sheet.addRow([group.category]);
        sheet.mergeCells(groupRow.number, 1, groupRow.number, detailColumns.length);
        groupRow.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17435C' } };
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        });

        for (const row of group.rows) {
          const dataRow = sheet.addRow([
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

      const t = report.totals;
      const totalRow = sheet.addRow(['', 'Total', '', '', '', t.actualHrs, t.basic, t.ot1, t.ot2, t.paid, t.idle]);
      totalRow.eachCell(cell => { cell.font = { bold: true }; });

      // Job-wise Summary - same section the single-print export has, appended below the
      // details table in this DSR's own sheet instead of a separate shared sheet.
      sheet.addRow([]);
      const summaryColumns = ['Sl No', 'Job No', 'Actual Hrs', 'Basic', 'OT', 'Paid', 'Idle'];
      const summaryTitleRow = sheet.addRow(['Job-wise Summary']);
      sheet.mergeCells(summaryTitleRow.number, 1, summaryTitleRow.number, summaryColumns.length);
      summaryTitleRow.font = { bold: true, size: 12 };

      const summaryHeaderRow = sheet.addRow(summaryColumns);
      summaryHeaderRow.eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3F8' } };
      });

      for (const row of report.jobSummary) {
        sheet.addRow([
          this.rowValue(row, 'SlNo'),
          this.rowValue(row, 'SoNo'),
          this.rowValue(row, 'ActualHrs'),
          this.rowValue(row, 'Basic'),
          this.rowValue(row, 'OT'),
          this.rowValue(row, 'Paid'),
          this.rowValue(row, 'Idle')
        ]);
      }
      if (report.jobSummary.length === 0) sheet.addRow(['No job summary']);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DSR Time Sheets (${this.reports().length}).xlsx`;
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
