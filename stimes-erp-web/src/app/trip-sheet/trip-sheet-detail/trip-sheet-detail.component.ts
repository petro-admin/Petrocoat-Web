import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TripSheetService } from '../services/trip-sheet.service';
import { AuthService } from '../../core/services/auth.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { DateInputComponent } from '../../shared/date-input/date-input.component';

// Matches this.GetType().ToString() in the desktop app's convention - registered in
// AdminModuleInfo (ModuleCode 369), kept in sync with trip-sheet-list.component.ts.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.TripSheet';

@Component({
  selector: 'app-trip-sheet-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DateInputComponent],
  templateUrl: './trip-sheet-detail.component.html',
  styleUrl: './trip-sheet-detail.component.scss'
})
export class TripSheetDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  drivers = signal<any[]>([]);
  vehicles = signal<any[]>([]);

  // Matches desktop's CheckPermission() - rights.access gates the whole page.
  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  get legs(): FormArray { return this.form.get('legs') as FormArray; }

  // Matches desktop's "Completed docs are locked" convention - once an existing Trip Sheet is
  // marked Completed, Save is disabled so it can't be edited further. New (unsaved) sheets are
  // never locked even if Completed is pre-selected.
  get isLocked(): boolean {
    return !this.isNew && this.toNumber(this.form.get('statusCode')?.value) === 1;
  }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: TripSheetService,
    private auth: AuthService,
    private settings: SettingsService,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {
    this.form = this.fb.group({
      docNo: [{ value: '', disabled: true }],
      docDate: ['', Validators.required],
      driverCode: [null, Validators.required],
      vehicleCode: [null, Validators.required],
      startTime: [null],
      startOdometer: [null],
      startLocation: [''],
      endTime: [null],
      endOdometer: [null],
      endLocation: [''],
      fuelConsumption: [null],
      remarks: [''],
      statusCode: [0],
      legs: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.code === 0;
    this.loadRights();

    this.service.getLookups().subscribe({
      next: res => {
        this.drivers.set(res?.drivers ?? []);
        this.vehicles.set(res?.vehicles ?? []);
        if (this.isNew) this.defaultDriverToCurrentUser();
      },
      error: () => this.errorMessage.set('Could not load Driver/Vehicle lookups.')
    });

    if (this.isNew) {
      this.form.patchValue({ docDate: this.today() });
      this.service.generateDocNo().subscribe({ next: res => this.form.patchValue({ docNo: res?.docNo ?? '' }) });
      this.addLegRow();
    } else {
      this.loadExisting();
    }
  }

  private today(): string {
    const processingDate = this.settings.processingDate() ?? new Date();
    return processingDate.toISOString().substring(0, 10);
  }

  // Matches this ERP account to a Driver by AdminUserMaster.EmpCode (carried in the JWT as
  // "empCode") - only pre-selects if that employee is actually in the Driver-eligible list
  // (same rule as VSR's driver dropdown), otherwise leaves it for the user to pick manually.
  private defaultDriverToCurrentUser(): void {
    const empCode = this.auth.currentUser()?.empCode;
    if (!empCode) return;
    const match = this.drivers().find(d => this.toNumber(this.read(d, 'EmployeeCode')) === empCode);
    if (match) this.form.patchValue({ driverCode: empCode });
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getById(this.code).subscribe({
      next: res => {
        const header = this.read(res, 'Header') ?? res;
        this.form.patchValue({
          docNo: this.read(header, 'DocNo') ?? '',
          docDate: this.read(header, 'DocDate'),
          driverCode: this.read(header, 'DriverCode'),
          vehicleCode: this.read(header, 'VehicleCode'),
          startTime: this.toDateTimeLocal(this.read(header, 'StartTime')),
          startOdometer: this.read(header, 'StartOdometer'),
          startLocation: this.read(header, 'StartLocation') ?? '',
          endTime: this.toDateTimeLocal(this.read(header, 'EndTime')),
          endOdometer: this.read(header, 'EndOdometer'),
          endLocation: this.read(header, 'EndLocation') ?? '',
          fuelConsumption: this.read(header, 'FuelConsumption'),
          remarks: this.read(header, 'Remarks') ?? '',
          statusCode: this.toNumber(this.read(header, 'StatusCode'))
        });

        this.legs.clear();
        const legRows = this.read(res, 'Legs') ?? [];
        for (const leg of legRows) this.addLegRow(leg);
        if (this.legs.length === 0) this.addLegRow();

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this Trip Sheet.'); this.loading.set(false); }
    });
  }

  // One row of the driver's paper "Daily Trip Sheet" - Time/Job No/Location/Starting Kilo/
  // Ending Kilo/Remarks, matching the physical form's grid exactly. Fully manual entry.
  addLegRow(data?: any): void {
    this.legs.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.legs.length + 1],
      legTime: [this.toTimeOnly(this.read(data, 'LegTime'))],
      jobNo: [this.toText(this.read(data, 'JobNo'))],
      location: [this.toText(this.read(data, 'Location'))],
      startKm: [this.read(data, 'StartKm')],
      endKm: [this.read(data, 'EndKm')],
      remarks: [this.toText(this.read(data, 'Remarks'))]
    }));
  }

  removeLegRow(index: number): void {
    this.legs.removeAt(index);
    this.legs.controls.forEach((c, i) => c.patchValue({ slNo: i + 1 }, { emitEvent: false }));
  }

  save(): void {
    const allowed = this.isNew ? this.rights().add : this.rights().edit;
    if (!allowed) {
      this.errorMessage.set(`You do not have permission to ${this.isNew ? 'add' : 'edit'} this record.`);
      return;
    }

    if (this.isLocked) {
      this.errorMessage.set('This Trip Sheet is Completed and cannot be edited.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please fill in Driver and Vehicle.');
      return;
    }

    const v = this.form.getRawValue();
    const payload = {
      code: this.code,
      docNo: this.toText(v.docNo),
      docDate: v.docDate,
      driverCode: this.toNumber(v.driverCode),
      vehicleCode: this.toNumber(v.vehicleCode),
      startTime: v.startTime || null,
      startOdometer: v.startOdometer != null ? this.toNumber(v.startOdometer) : null,
      startLocation: this.toText(v.startLocation),
      endTime: v.endTime || null,
      endOdometer: v.endOdometer != null ? this.toNumber(v.endOdometer) : null,
      endLocation: this.toText(v.endLocation),
      fuelConsumption: v.fuelConsumption != null ? this.toNumber(v.fuelConsumption) : null,
      remarks: this.toText(v.remarks),
      statusCode: this.toNumber(v.statusCode),
      mode: this.isNew ? 0 : 1,
      legs: (v.legs ?? [])
        .filter((leg: any) => this.toText(leg.location))
        .map((leg: any) => ({
          slNo: this.toNumber(leg.slNo),
          legTime: this.combineDateAndTime(v.docDate, leg.legTime),
          jobNo: this.toText(leg.jobNo),
          location: this.toText(leg.location),
          startKm: leg.startKm != null ? this.toNumber(leg.startKm) : null,
          endKm: leg.endKm != null ? this.toNumber(leg.endKm) : null,
          remarks: this.toText(leg.remarks)
        }))
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.save(payload).subscribe({
      next: async () => {
        this.saving.set(false);
        await this.confirmDialog.notify('Trip Sheet saved successfully.');
        this.router.navigate(['/trip-sheet']);
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this Trip Sheet.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/trip-sheet']);
  }

  print(): void {
    const a = document.createElement('a');
    a.href = `/trip-sheet/${this.code}/print`;
    a.target = '_blank';
    a.click();
  }

  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  toText(value: unknown): string {
    return value == null ? '' : String(value);
  }

  // <input type="datetime-local"> needs a "YYYY-MM-DDTHH:mm" string in local wall-clock time -
  // neither a Date object nor a plain ISO string from the API displays correctly on its own.
  private toDateTimeLocal(value: unknown): string {
    if (!value) return '';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // <input type="time"> needs just "HH:mm" - the leg's date always comes from the Trip Sheet's
  // own Doc Date (see combineDateAndTime below), not typed per leg.
  private toTimeOnly(value: unknown): string {
    if (!value) return '';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Combines the Trip Sheet's Doc Date with a leg's "HH:mm" time into a full datetime the
  // backend can store - a leg only ever happens on the same day as the trip itself.
  private combineDateAndTime(docDate: unknown, time: unknown): string | null {
    if (!time) return null;
    const d = new Date(docDate as string);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}`;
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
