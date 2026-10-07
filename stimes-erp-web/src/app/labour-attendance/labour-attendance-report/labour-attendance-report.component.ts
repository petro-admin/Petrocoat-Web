import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LabourAttendanceService } from '../services/labour-attendance.service';
import { StaffAttendanceService } from '../../staff-attendance/services/staff-attendance.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

// One shared report page for both attendance pools (Staff and Labour), switched by a radio
// toggle rather than two separate pages - the report is just a read-only view, so unlike the
// Activity/Scan screens (which genuinely differ - only Labour has a Job field) there's no reason
// to duplicate the whole page. Kept under the existing "Labour Attendance Report" permission
// (AdminModuleInfo ModuleCode 371) rather than registering a new one, since the toggle is a data
// filter, not a separate form - whoever can see this report sees both pools.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.HR.Report_LabourAttendance';

type AttendanceMode = 'labour' | 'staff';

@Component({
  selector: 'app-labour-attendance-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './labour-attendance-report.component.html',
  styleUrl: './labour-attendance-report.component.scss'
})
export class LabourAttendanceReportComponent implements OnInit {
  mode = signal<AttendanceMode>('labour');

  rows = signal<any[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  fromDate = signal(this.today());
  toDate = signal(this.today());

  // Job/Sales Order filter only applies in Labour mode - Staff attendance has no Job concept.
  salesOrders = signal<any[]>([]);
  jobNoText = signal('');
  jobCode = signal<number | null>(null);

  employees = signal<any[]>([]);
  employeeText = signal('');
  employeeCode = signal<number | null>(null);

  // Photo thumbnails, fetched lazily the same authenticated way as the Scan tab's Today's
  // Attendance table (the photo endpoint needs the JWT, so a plain <img src> can't load it).
  photoUrls = signal<Record<number, string>>({});
  private photoUrlsLoading = new Set<number>();

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private labourService: LabourAttendanceService,
    private staffService: StaffAttendanceService,
    private router: Router,
    private userRightsService: UserRightsService
  ) {}

  ngOnInit(): void {
    this.loadEmployeePickerData();
    this.load();
    this.loadRights();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  // Switching pools clears filters that don't carry across (Job only ever applied to Labour) and
  // reloads both the employee picker list and the report itself for the newly selected pool.
  setMode(mode: AttendanceMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.jobCode.set(null);
    this.jobNoText.set('');
    this.employeeCode.set(null);
    this.employeeText.set('');
    this.photoUrls.set({});
    this.loadEmployeePickerData();
    this.load();
  }

  private loadEmployeePickerData(): void {
    if (this.mode() === 'labour') {
      this.labourService.getSalesOrders().subscribe({ next: rows => this.salesOrders.set(rows ?? []) });
      this.labourService.getEmployees().subscribe({ next: rows => this.employees.set(rows ?? []) });
    } else {
      this.employees.set([]);
      this.staffService.getEmployees().subscribe({ next: rows => this.employees.set(rows ?? []) });
    }
  }

  back(): void {
    this.router.navigate([this.mode() === 'labour' ? '/labour-attendance' : '/staff-attendance']);
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    const report$ = this.mode() === 'labour'
      ? this.labourService.getReport(this.fromDate(), this.toDate(), this.jobCode(), this.employeeCode())
      : this.staffService.getReport(this.fromDate(), this.toDate(), this.employeeCode());

    report$.subscribe({
      next: rows => {
        this.rows.set(rows ?? []);
        this.ensurePhotosLoaded(rows ?? []);
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load the report.'); this.loading.set(false); }
    });
  }

  private ensurePhotosLoaded(rows: any[]): void {
    const photoService = this.mode() === 'labour' ? this.labourService : this.staffService;
    const codes = new Set(rows.map(r => this.toNumber(this.read(r, 'EmployeeCode'))).filter(c => c > 0));
    for (const code of codes) {
      if (this.photoUrls()[code] !== undefined || this.photoUrlsLoading.has(code)) continue;
      this.photoUrlsLoading.add(code);
      photoService.getEmployeePhotoBlob(code).subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          this.photoUrls.update(map => ({ ...map, [code]: url }));
          this.photoUrlsLoading.delete(code);
        },
        error: () => {
          this.photoUrls.update(map => ({ ...map, [code]: '' }));
          this.photoUrlsLoading.delete(code);
        }
      });
    }
  }

  onJobTextChanged(value: string): void {
    if (!value.trim()) { this.jobCode.set(null); return; }
    const order = this.salesOrders().find(so => String(this.read(so, 'SONo')).trim().toLowerCase() === value.trim().toLowerCase());
    this.jobCode.set(order ? this.toNumber(this.read(order, 'SOCode')) : null);
  }

  onJobSelected(value: string): void {
    this.onJobTextChanged(value);
  }

  onEmployeeTextChanged(value: string): void {
    if (!value.trim()) { this.employeeCode.set(null); return; }
    const emp = this.employees().find(e => String(this.read(e, 'EmpFullName')).trim().toLowerCase() === value.trim().toLowerCase());
    this.employeeCode.set(emp ? this.toNumber(this.read(emp, 'EmployeeCode')) : null);
  }

  onEmployeeSelected(value: string): void {
    this.onEmployeeTextChanged(value);
  }

  mapLink(lat: unknown, lng: unknown): string | null {
    const latitude = this.toNumber(lat);
    const longitude = this.toNumber(lng);
    if (!latitude && !longitude) return null;
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
