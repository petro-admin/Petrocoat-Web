import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TripSheetService } from '../services/trip-sheet.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { MultiSelectComponent } from '../../shared/multi-select/multi-select.component';

// Registered as its own form (AdminModuleInfo ModuleCode 373, under Fleet's SystemCode) so it can
// be granted independently of the manual Trip Sheet form/report. Entirely GPS-derived (see
// TripSheetService.GetGpsTripReport) - no relation to the driver-filled paper-style Trip Sheet.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.Report_TripSheetGps';

// One row per actual Ignition On -> Ignition Off cycle (not a whole-day summary), grouped by
// vehicle - matches the collapsible Branch/Sono grouping pattern used in Resource Return/Leave
// Application list screens.
interface VehicleGroup {
  key: string;
  label: string;
  rows: any[];
  totalDistanceKm: number;
}

@Component({
  selector: 'app-trip-sheet-gps-report',
  standalone: true,
  imports: [CommonModule, FormsModule, MultiSelectComponent],
  templateUrl: './trip-sheet-gps-report.component.html',
  styleUrl: './trip-sheet-gps-report.component.scss'
})
export class TripSheetGpsReportComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  fromDate = signal(this.today());
  toDate = signal(this.today());

  drivers = signal<any[]>([]);
  driverCodes = signal<number[]>([]);
  // MultiSelectComponent reads plain {value,label} objects rather than the raw API rows, so it
  // doesn't need to know about this app's PascalCase/camelCase key-casing fallback (the read()
  // helper below already handles that once, here).
  driverOptions = computed(() => this.drivers().map(d => ({ value: this.toNumber(this.read(d, 'EmployeeCode')), label: this.read(d, 'EmpFullName') })));

  vehicles = signal<any[]>([]);
  vehicleCodes = signal<number[]>([]);
  vehicleOptions = computed(() => this.vehicles().map(v => ({ value: this.toNumber(this.read(v, 'VehicleCode')), label: this.read(v, 'RegistrationNo') })));

  // Drops legs with no matched Ignition Off at all (the vendor never sent one - a real data
  // gap, not something worth showing as a row) unless the leg is genuinely still running right
  // now (IsOngoing) - and drops legs under 0.5 km (GPS drift while parked - e.g. 0.001 km - not
  // an actual trip, same noise class as an exact 0 km match).
  filteredRows = computed(() => this.rows().filter(row => {
    if (!this.read(row, 'RouteEnd') && !this.read(row, 'IsOngoing')) return false;
    const distance = this.read(row, 'DistanceKm');
    return distance == null || this.toNumber(distance) >= 0.5;
  }));

  groups = computed<VehicleGroup[]>(() => this.buildGroups(this.filteredRows()));
  collapsed = signal<Set<string>>(new Set());
  totalDistanceKm = computed(() => this.round2(this.filteredRows().reduce((sum, row) => sum + this.toNumber(this.read(row, 'DistanceKm')), 0)));

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private service: TripSheetService,
    private router: Router,
    private userRightsService: UserRightsService
  ) {}

  ngOnInit(): void {
    this.service.getLookups().subscribe({
      // gpsDrivers, not drivers - also includes VehicleGpsMapping.FixedDriverEmployeeCode staff,
      // since this report's rows can already resolve to them (unlike the manual Trip Sheet's own
      // driver field, which stays drivers-only).
      next: res => { this.drivers.set(res?.gpsDrivers ?? []); this.vehicles.set(res?.vehicles ?? []); }
    });
    this.load();
    this.loadRights();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  back(): void {
    this.router.navigate(['/trip-sheet']);
  }

  // Collapsed vehicle groups aren't in the DOM at all (an @if, not a CSS hide), so a collapsed
  // group would silently be missing from the printout - expand everything first.
  print(): void {
    this.expandAllGroups();
    setTimeout(() => window.print());
  }

  // One row per Ignition On -> Ignition Off leg, grouped by vehicle (matches the on-screen
  // grouping) instead of by day - Fuel Consumption is left blank since it's never entered
  // anywhere in the GPS-derived data (no paper Trip Sheet backs these rows).
  async downloadExcel(): Promise<void> {
    const XLSX = await import('xlsx');
    const aoa: any[][] = [
      ['SL NO', 'DATE', 'KM', 'FUEL CONSUMPTION', 'DRIVER', 'TRIP START TIME', 'TRIP END TIME']
    ];

    for (const group of this.groups()) {
      aoa.push([`${group.label}  (Total: ${group.totalDistanceKm} km)`]);
      let slNo = 0;
      for (const row of group.rows) {
        slNo++;
        aoa.push([
          slNo,
          this.formatDate(this.read(row, 'TripDate')),
          this.read(row, 'DistanceKm') ?? '',
          '',
          this.read(row, 'DriverName') ?? '',
          this.formatTime(this.read(row, 'RouteStart')),
          this.formatTime(this.read(row, 'RouteEnd'))
        ]);
      }
    }

    aoa.push(['', 'TOTAL', `${this.totalDistanceKm()} km`, '', '', '', '']);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), 'Trip Sheet Report');
    XLSX.writeFile(workbook, `Trip Sheet Report ${this.fromDate()} to ${this.toDate()}.xlsx`);
  }

  private formatTime(value: unknown): string {
    if (!value) return '';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private formatDate(value: unknown): string {
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getGpsTripReport(this.fromDate(), this.toDate(), this.driverCodes(), this.vehicleCodes()).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); this.collapseAllGroups(); },
      error: () => { this.errorMessage.set('Could not load the GPS trip report.'); this.loading.set(false); }
    });
  }

  private buildGroups(rows: any[]): VehicleGroup[] {
    const map = new Map<string, any[]>();
    for (const row of rows) {
      const key = this.toText(this.read(row, 'RegistrationNo')) || '(unknown)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }

    const groups: VehicleGroup[] = [];
    for (const [key, groupRows] of map) {
      const totalDistanceKm = groupRows.reduce((sum, row) => sum + this.toNumber(this.read(row, 'DistanceKm')), 0);
      groups.push({ key, label: key, rows: groupRows, totalDistanceKm: this.round2(totalDistanceKm) });
    }
    return groups;
  }

  toggle(key: string): void {
    const next = new Set(this.collapsed());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.collapsed.set(next);
  }

  isCollapsed(key: string): boolean {
    return this.collapsed().has(key);
  }

  private expandAllGroups(): void {
    this.collapsed.set(new Set());
  }

  private collapseAllGroups(): void {
    this.collapsed.set(new Set(this.groups().map(g => g.key)));
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // Exact coordinates pin the right spot every time - a text search of the Address string (the
  // old behaviour) fails whenever that address isn't a place Google Maps can actually resolve.
  // Falls back to the text search only for rows saved before Latitude/Longitude were selected.
  mapLink(location: unknown, lat?: unknown, lng?: unknown): string | null {
    const latNum = this.toNumber(lat);
    const lngNum = this.toNumber(lng);
    if (latNum && lngNum) return `https://www.google.com/maps?q=${latNum},${lngNum}`;

    const text = this.toText(location).trim();
    return text ? `https://www.google.com/maps?q=${encodeURIComponent(text)}` : null;
  }

  private today(): string {
    const d = new Date();
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
