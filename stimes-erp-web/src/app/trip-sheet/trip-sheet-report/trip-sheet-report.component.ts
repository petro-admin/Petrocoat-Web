import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TripSheetService } from '../services/trip-sheet.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

// Report is part of the Trip Sheet module, same permission as the list/detail forms.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.TripSheet';

interface DayGroup {
  dateKey: string;
  dayLabel: string;
  rows: any[];
}

@Component({
  selector: 'app-trip-sheet-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trip-sheet-report.component.html',
  styleUrl: './trip-sheet-report.component.scss'
})
export class TripSheetReportComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  fromDate = signal(this.firstDayOfMonth());
  toDate = signal(this.today());

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  // Groups the flat, already-date-ordered rows into per-day sections - same pattern the
  // existing Excel process uses (a bold "SATURDAY - 1 AUGUST 2026" header row per day).
  groups = computed<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    for (const row of this.rows()) {
      const dateKey = this.toDateOnly(this.read(row, 'DocDate'));
      const last = groups[groups.length - 1];
      if (last && last.dateKey === dateKey) {
        last.rows.push(row);
      } else {
        groups.push({ dateKey, dayLabel: this.formatDayLabel(this.read(row, 'DocDate')), rows: [row] });
      }
    }
    return groups;
  });

  totalKm = computed(() => this.round2(this.rows().reduce((sum, row) => sum + this.toNumber(this.read(row, 'Km')), 0)));

  constructor(
    private service: TripSheetService,
    private router: Router,
    private userRightsService: UserRightsService
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadRights();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getReport(this.fromDate(), this.toDate()).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load the Trip Sheet report.'); this.loading.set(false); }
    });
  }

  back(): void {
    this.router.navigate(['/trip-sheet']);
  }

  print(): void {
    window.print();
  }

  // Uses exceljs instead of the plain xlsx library - xlsx (SheetJS Community Edition) can't write
  // cell colors into the output file at all (silently ignored), so it can't produce the two-tone
  // header/day-group look this needs. Colors match the print layout's own header/day-row colors
  // for consistency (see the SCSS's .print-table th / .day-row).
  async downloadExcel(): Promise<void> {
    // esbuild's CJS interop for exceljs sometimes nests the real module under .default rather
    // than exposing Workbook directly on the namespace - this works with either shape, while
    // keeping the module's real types (unlike casting the whole module to `any`).
    const ExcelJS = await import('exceljs');
    const WorkbookCtor = (ExcelJS.Workbook ?? (ExcelJS as any).default?.Workbook) as typeof ExcelJS.Workbook;
    const workbook = new WorkbookCtor();
    const sheet = workbook.addWorksheet('Trip Sheet');

    const columns = [
      'SL NO', 'VEHICLE NO', 'KM', 'FUEL CONSUMPTION', 'DRIVER', 'ROUTE START TIME',
      'FIRST SITE NO', 'FIRST SITE REACH TIME', 'LAST SITE NO', 'LAST SITE START TIME', 'CAMP REACH TIME'
    ];
    sheet.columns = columns.map(header => ({ header, width: Math.max(header.length + 2, 14) }));

    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE600' } };
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center' };
    });

    for (const group of this.groups()) {
      const dayRow = sheet.addRow([group.dayLabel]);
      sheet.mergeCells(dayRow.number, 1, dayRow.number, columns.length);
      dayRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAF5' } };
        cell.font = { bold: true };
      });

      for (const row of group.rows) {
        sheet.addRow([
          this.read(row, 'SlNo'),
          this.read(row, 'RegistrationNo'),
          this.read(row, 'Km'),
          this.read(row, 'FuelConsumption'),
          this.read(row, 'DriverName'),
          this.formatTime(this.read(row, 'RouteStartTime')),
          this.read(row, 'FirstSiteNo'),
          this.formatTime(this.read(row, 'FirstSiteReachTime')),
          this.read(row, 'LastSiteNo'),
          this.formatTime(this.read(row, 'LastSiteStartTime')),
          this.formatTime(this.read(row, 'CampReachTime'))
        ]);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Trip Sheet Report ${this.fromDate()} to ${this.toDate()}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  formatTime(value: unknown): string {
    if (!value) return '';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private formatDayLabel(value: unknown): string {
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    const day = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    const date = d.getDate();
    const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
    return `${day} - ${date} ${month} ${d.getFullYear()}`;
  }

  private toDateOnly(value: unknown): string {
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private firstDayOfMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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
