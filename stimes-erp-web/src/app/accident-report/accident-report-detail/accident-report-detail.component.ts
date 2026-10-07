import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccidentReportService } from '../services/accident-report.service';
import { AuthService } from '../../core/services/auth.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.AccidentReporting';

interface PhotoItem {
  filePath: string;
  url: string;
}

interface DocumentItem {
  slNo: number;
  description: string;
  filePath: string;
  name: string;
}

@Component({
  selector: 'app-accident-report-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './accident-report-detail.component.html',
  styleUrl: './accident-report-detail.component.scss'
})
export class AccidentReportDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  drivers = signal<any[]>([]);
  vehicles = signal<any[]>([]);

  locating = signal(false);
  locationError = signal<string | null>(null);

  photos = signal<PhotoItem[]>([]);
  uploadingPhoto = signal(false);

  documents = signal<DocumentItem[]>([]);
  uploadingDocument = signal(false);
  pendingDocDescription = signal('');

  lastKnownGps = signal<any | null>(null);
  fetchingGps = signal(false);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  readonly severities = [
    { value: 'Minor', color: '#96650c', bg: '#fdf2e0' },
    { value: 'Major', color: '#b3541e', bg: '#fde4d1' },
    { value: 'Injury', color: '#b3261e', bg: '#fde1e1' },
    { value: 'Fatal', color: '#ffffff', bg: '#3a1414' }
  ];

  // Existing reports stay editable while the driver's own submission is still "Submitted" - once
  // a supervisor moves it to Under Review/Closed, only the Review panel (status/remarks) stays
  // open, so an on-site edit can never quietly change facts after someone has started reviewing it.
  get fieldsLocked(): boolean {
    return !this.isNew && this.form.get('status')?.value !== 'Submitted';
  }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: AccidentReportService,
    private auth: AuthService,
    private settings: SettingsService,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {
    this.form = this.fb.group({
      docNo: [{ value: '', disabled: true }],
      docDateTime: ['', Validators.required],
      driverEmployeeCode: [null, Validators.required],
      vehicleCode: [null, Validators.required],
      odometerKm: [null],
      latitude: [null],
      longitude: [null],
      locationDescription: [''],
      severity: ['Minor'],
      accidentDescription: [''],
      otherVehicleInvolved: [false],
      otherVehiclePlateNo: [''],
      otherDriverName: [''],
      otherDriverContact: [''],
      policeCalled: [false],
      policeReportNo: [''],
      injuriesReported: [false],
      injuryDetails: [''],
      status: ['Submitted'],
      supervisorRemarks: ['']
    });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.code === 0;
    this.loadRights();

    this.service.getDrivers().subscribe({
      next: rows => { this.drivers.set(rows ?? []); if (this.isNew) this.defaultDriverToCurrentUser(); },
      error: () => {}
    });
    this.service.getVehicles().subscribe({ next: rows => this.vehicles.set(rows ?? []), error: () => {} });

    if (this.isNew) {
      this.form.patchValue({ docDateTime: this.nowLocal() });
      this.service.generateDocNo().subscribe({ next: res => this.form.patchValue({ docNo: res?.docNo ?? '' }) });
      this.captureLocation();
      this.form.get('vehicleCode')?.valueChanges.subscribe(vehicleCode => this.fetchLastKnownGps(vehicleCode));
    } else {
      this.loadExisting();
    }
  }

  // Auto-fills Odometer from the vehicle's last Ignition Off reading (a real number the driver
  // would otherwise have to guess) - never touches Latitude/Longitude/Location, since the live
  // GPS capture above is the actual accident scene and must stay authoritative. Shown alongside
  // as a labelled reference instead, in case the live capture fails and the driver needs a
  // fallback to start from.
  private fetchLastKnownGps(vehicleCode: number | null): void {
    this.lastKnownGps.set(null);
    if (!vehicleCode) return;
    this.fetchingGps.set(true);
    this.service.getLastKnownGps(vehicleCode).subscribe({
      next: snapshot => {
        this.fetchingGps.set(false);
        if (!snapshot) return;
        this.lastKnownGps.set(snapshot);
        if (!this.form.get('odometerKm')?.value) {
          this.form.patchValue({ odometerKm: this.read(snapshot, 'Odometer') });
        }
        // Only fills Location if the live GPS capture (the actual accident scene) hasn't already
        // set one - never overwrites it once set.
        if (!this.form.get('locationDescription')?.value) {
          this.useLastKnownLocation();
        }
      },
      error: () => this.fetchingGps.set(false)
    });
  }

  useLastKnownLocation(): void {
    const snap = this.lastKnownGps();
    if (!snap) return;
    this.form.patchValue({
      latitude: this.read(snap, 'Latitude'),
      longitude: this.read(snap, 'Longitude'),
      locationDescription: this.toText(this.read(snap, 'Address'))
    });
  }

  lastKnownMapLink(): string | null {
    const snap = this.lastKnownGps();
    if (!snap) return null;
    const lat = this.read(snap, 'Latitude');
    const lng = this.read(snap, 'Longitude');
    if (!lat || !lng) return null;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private defaultDriverToCurrentUser(): void {
    const empCode = this.auth.currentUser()?.empCode;
    if (!empCode) return;
    const match = this.drivers().find(d => this.toNumber(this.read(d, 'EmployeeCode')) === empCode);
    if (match) this.form.patchValue({ driverEmployeeCode: empCode });
  }

  // Fire-and-forget on page load, with a manual "Re-capture" retry - a driver at the accident
  // scene may have a slow/denied first GPS fix (indoors, poor signal) and shouldn't be stuck.
  captureLocation(): void {
    this.locationError.set(null);
    if (!navigator.geolocation) {
      this.locationError.set('This browser/device does not support location capture.');
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.form.patchValue({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        this.locating.set(false);
      },
      () => {
        this.locationError.set('Could not get your location - check location permission and try again.');
        this.locating.set(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getById(this.code).subscribe({
      next: res => {
        const header = this.read(res, 'Header') ?? res;
        this.form.patchValue({
          docNo: this.read(header, 'DocNo') ?? '',
          docDateTime: this.toDateTimeLocal(this.read(header, 'DocDateTime')),
          driverEmployeeCode: this.read(header, 'DriverEmployeeCode'),
          vehicleCode: this.read(header, 'VehicleCode'),
          odometerKm: this.read(header, 'OdometerKm'),
          latitude: this.read(header, 'Latitude'),
          longitude: this.read(header, 'Longitude'),
          locationDescription: this.read(header, 'LocationDescription') ?? '',
          severity: this.read(header, 'Severity') ?? 'Minor',
          accidentDescription: this.read(header, 'AccidentDescription') ?? '',
          otherVehicleInvolved: !!this.read(header, 'OtherVehicleInvolved'),
          otherVehiclePlateNo: this.read(header, 'OtherVehiclePlateNo') ?? '',
          otherDriverName: this.read(header, 'OtherDriverName') ?? '',
          otherDriverContact: this.read(header, 'OtherDriverContact') ?? '',
          policeCalled: !!this.read(header, 'PoliceCalled'),
          policeReportNo: this.read(header, 'PoliceReportNo') ?? '',
          injuriesReported: !!this.read(header, 'InjuriesReported'),
          injuryDetails: this.read(header, 'InjuryDetails') ?? '',
          status: this.read(header, 'Status') ?? 'Submitted',
          supervisorRemarks: this.read(header, 'SupervisorRemarks') ?? ''
        });

        const photoRows = this.read(res, 'Photos') ?? [];
        this.photos.set(photoRows.map((p: any) => ({ filePath: this.read(p, 'FilePath'), url: '' })));
        this.loadPhotoThumbnails();

        const docRows = this.read(res, 'Documents') ?? [];
        this.documents.set(docRows.map((d: any) => ({
          slNo: this.toNumber(this.read(d, 'SlNo')),
          description: this.toText(this.read(d, 'Description')),
          filePath: this.read(d, 'FilePath'),
          name: this.fileNameOf(this.read(d, 'FilePath'))
        })));

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this accident report.'); this.loading.set(false); }
    });
  }

  private loadPhotoThumbnails(): void {
    for (const photo of this.photos()) {
      this.service.getPhotoBlob(photo.filePath).subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          this.photos.update(list => list.map(p => p.filePath === photo.filePath ? { ...p, url } : p));
        },
        error: () => {}
      });
    }
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    this.uploadingPhoto.set(true);
    const uploads = Array.from(files).map(file =>
      this.service.uploadPhoto(file, this.settings.branchCode()).toPromise()
    );
    Promise.all(uploads).then(results => {
      const added = (results.filter(Boolean) as { fileName: string }[]).map(r => ({ filePath: r.fileName, url: URL.createObjectURL(files[0]) }));
      this.photos.update(list => [...list, ...added]);
      this.uploadingPhoto.set(false);
      input.value = '';
    }).catch(() => {
      this.uploadingPhoto.set(false);
      this.errorMessage.set('Could not upload one or more photos.');
      input.value = '';
    });
  }

  removePhoto(index: number): void {
    this.photos.update(list => list.filter((_, i) => i !== index));
  }

  // General-purpose document attachment (police report, insurance papers, anything else) - each
  // upload is added as its own row with the description currently typed in the "add document"
  // field, so several documents with different descriptions can build up as a table.
  onDocumentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const description = this.pendingDocDescription().trim();
    this.uploadingDocument.set(true);
    this.service.uploadPhoto(file, this.settings.branchCode()).subscribe({
      next: res => {
        this.documents.update(list => [...list, {
          slNo: list.length + 1,
          description,
          filePath: res.fileName,
          name: res.originalName
        }]);
        this.pendingDocDescription.set('');
        this.uploadingDocument.set(false);
        input.value = '';
      },
      error: () => {
        this.uploadingDocument.set(false);
        this.errorMessage.set('Could not upload the document.');
        input.value = '';
      }
    });
  }

  removeDocument(index: number): void {
    this.documents.update(list => list.filter((_, i) => i !== index).map((d, i) => ({ ...d, slNo: i + 1 })));
  }

  private fileNameOf(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] ?? path;
  }

  save(): void {
    const allowed = this.isNew ? this.rights().add : this.rights().edit;
    if (!allowed) {
      this.errorMessage.set(`You do not have permission to ${this.isNew ? 'add' : 'edit'} this record.`);
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please fill in Date/Time, Driver and Vehicle.');
      return;
    }

    const v = this.form.getRawValue();
    const payload = {
      code: this.code,
      docNo: this.toText(v.docNo),
      docDateTime: v.docDateTime,
      driverEmployeeCode: this.toNumber(v.driverEmployeeCode),
      vehicleCode: this.toNumber(v.vehicleCode),
      odometerKm: v.odometerKm != null && v.odometerKm !== '' ? this.toNumber(v.odometerKm) : null,
      latitude: v.latitude != null ? this.toNumber(v.latitude) : null,
      longitude: v.longitude != null ? this.toNumber(v.longitude) : null,
      locationDescription: this.toText(v.locationDescription),
      severity: v.severity,
      accidentDescription: this.toText(v.accidentDescription),
      otherVehicleInvolved: !!v.otherVehicleInvolved,
      otherVehiclePlateNo: this.toText(v.otherVehiclePlateNo),
      otherDriverName: this.toText(v.otherDriverName),
      otherDriverContact: this.toText(v.otherDriverContact),
      policeCalled: !!v.policeCalled,
      policeReportNo: this.toText(v.policeReportNo),
      injuriesReported: !!v.injuriesReported,
      injuryDetails: this.toText(v.injuryDetails),
      status: v.status,
      supervisorRemarks: this.toText(v.supervisorRemarks),
      photoPaths: this.photos().map(p => p.filePath),
      documents: this.documents().map(d => ({ slNo: d.slNo, description: d.description, filePath: d.filePath }))
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.save(payload).subscribe({
      next: async () => {
        this.saving.set(false);
        await this.confirmDialog.notify('Accident report saved successfully.');
        this.router.navigate(['/accident-report']);
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this accident report.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/accident-report']);
  }

  mapLink(): string | null {
    const lat = this.form.get('latitude')?.value;
    const lng = this.form.get('longitude')?.value;
    if (!lat || !lng) return null;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  severityMeta(value: string) {
    return this.severities.find(s => s.value === value) ?? this.severities[0];
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
