import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { VehicleHandoverService } from '../services/vehicle-handover.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.VehicleHandover';

@Component({
  selector: 'app-vehicle-handover-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './vehicle-handover-detail.component.html',
  styleUrl: './vehicle-handover-detail.component.scss'
})
export class VehicleHandoverDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  vehicles = signal<any[]>([]);
  employees = signal<any[]>([]);

  // Single vehicle photograph - not a multi-photo gallery like Accident Report, since a handover
  // only ever needs one condition-at-handover shot.
  photoPath = signal<string | null>(null);
  photoUrl = signal<string | null>(null);
  uploadingPhoto = signal(false);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: VehicleHandoverService,
    private settings: SettingsService,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {
    this.form = this.fb.group({
      docNo: [{ value: '', disabled: true }],
      handoverDate: ['', Validators.required],
      vehicleCode: [null, Validators.required],
      odometerKm: [null],
      handedOverByName: ['', Validators.required],
      handedOverByDesignation: [''],
      handedOverByContact: [''],
      receivedByName: ['', Validators.required],
      receivedByDesignation: [''],
      receivedByContact: [''],
      reason: ['']
    });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.code === 0;
    this.loadRights();

    this.service.getVehicles().subscribe({ next: rows => this.vehicles.set(rows ?? []), error: () => {} });
    this.service.getEmployees().subscribe({ next: rows => this.employees.set(rows ?? []), error: () => {} });

    if (this.isNew) {
      this.form.patchValue({ handoverDate: this.nowLocal() });
      this.service.generateDocNo().subscribe({ next: res => this.form.patchValue({ docNo: res?.docNo ?? '' }) });
    } else {
      this.loadExisting();
    }
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
      next: header => {
        this.form.patchValue({
          docNo: this.read(header, 'DocNo') ?? '',
          handoverDate: this.toDateTimeLocal(this.read(header, 'HandoverDate')),
          vehicleCode: this.read(header, 'VehicleCode'),
          odometerKm: this.read(header, 'OdometerKm'),
          handedOverByName: this.read(header, 'HandedOverByName') ?? '',
          handedOverByDesignation: this.read(header, 'HandedOverByDesignation') ?? '',
          handedOverByContact: this.read(header, 'HandedOverByContact') ?? '',
          receivedByName: this.read(header, 'ReceivedByName') ?? '',
          receivedByDesignation: this.read(header, 'ReceivedByDesignation') ?? '',
          receivedByContact: this.read(header, 'ReceivedByContact') ?? '',
          reason: this.read(header, 'Reason') ?? ''
        });

        const path = this.read(header, 'PhotoPath');
        if (path) {
          this.photoPath.set(path);
          this.service.getPhotoBlob(path).subscribe({
            next: blob => this.photoUrl.set(URL.createObjectURL(blob)),
            error: () => {}
          });
        }

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this handover record.'); this.loading.set(false); }
    });
  }

  // Picking an employee fills Name/Designation/Contact from payrollEmployeeInfo, but those fields
  // stay plain editable text afterward (matching the existing DB columns, which store free text,
  // not an employee code) - so a name outside the dropdown, or a corrected contact number, still
  // works exactly as before.
  onEmployeeSelected(prefix: 'handedOverBy' | 'receivedBy', employeeCode: string): void {
    const employee = this.employees().find(row => String(this.read(row, 'EmployeeCode')) === employeeCode);
    if (!employee) return;

    this.form.patchValue({
      [`${prefix}Name`]: this.read(employee, 'EmpFullName') ?? '',
      [`${prefix}Designation`]: this.read(employee, 'DesigName') ?? '',
      [`${prefix}Contact`]: this.read(employee, 'ContactNo') ?? ''
    });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingPhoto.set(true);
    this.service.uploadPhoto(file, this.settings.branchCode()).subscribe({
      next: res => {
        this.photoPath.set(res.fileName);
        this.photoUrl.set(URL.createObjectURL(file));
        this.uploadingPhoto.set(false);
        input.value = '';
      },
      error: () => {
        this.uploadingPhoto.set(false);
        this.errorMessage.set('Could not upload the photo.');
        input.value = '';
      }
    });
  }

  removePhoto(): void {
    this.photoPath.set(null);
    this.photoUrl.set(null);
  }

  save(): void {
    const allowed = this.isNew ? this.rights().add : this.rights().edit;
    if (!allowed) {
      this.errorMessage.set(`You do not have permission to ${this.isNew ? 'add' : 'edit'} this record.`);
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please fill in Date, Vehicle, Handed Over By and Received By.');
      return;
    }

    const v = this.form.getRawValue();
    const payload = {
      code: this.code,
      docNo: this.toText(v.docNo),
      handoverDate: v.handoverDate,
      vehicleCode: this.toNumber(v.vehicleCode),
      odometerKm: v.odometerKm != null && v.odometerKm !== '' ? this.toNumber(v.odometerKm) : null,
      photoPath: this.photoPath(),
      handedOverByName: this.toText(v.handedOverByName),
      handedOverByDesignation: this.toText(v.handedOverByDesignation),
      handedOverByContact: this.toText(v.handedOverByContact),
      receivedByName: this.toText(v.receivedByName),
      receivedByDesignation: this.toText(v.receivedByDesignation),
      receivedByContact: this.toText(v.receivedByContact),
      reason: this.toText(v.reason)
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.save(payload, this.settings.branchCode()).subscribe({
      next: async () => {
        this.saving.set(false);
        await this.confirmDialog.notify('Vehicle handover saved successfully.');
        this.router.navigate(['/vehicle-handover']);
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this handover record.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/vehicle-handover']);
  }

  private nowLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private toDateTimeLocal(value: unknown): string {
    if (!value) return '';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
