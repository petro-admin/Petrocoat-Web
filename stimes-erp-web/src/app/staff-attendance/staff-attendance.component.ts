import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { StaffAttendanceService, FaceDescriptorRow } from './services/staff-attendance.service';
import { FaceRecognitionService } from '../labour-attendance/services/face-recognition.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../core/services/user-rights.service';
// Type-only import - see face-recognition.service.ts for why this must never be a real import here.
import type * as FaceApi from 'face-api.js';

// Independent sibling of LabourAttendanceComponent for office/technical staff (payrollEmployeeInfo
// CategoryCode 9/10/11) instead of labourers (12/13/14) - same face-recognition tech and Enroll/Scan
// design, but deliberately no Job/Sales Order field anywhere: office staff aren't tied to a site
// job the way labourers are, so a Job field here would just be confusing.
// Matches this.GetType().ToString() in the desktop app's convention - registered in
// AdminModuleInfo (ModuleCode 372).
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.HR.StaffAttendance';

// Same guided multi-angle enrollment as Labour Attendance - see its own ENROLL_ANGLES for why.
const ENROLL_ANGLES: { label: string; instruction: string }[] = [
  { label: 'Center', instruction: 'Look straight at the camera' },
  { label: 'Left', instruction: 'Slowly turn your head to the left' },
  { label: 'Right', instruction: 'Slowly turn your head to the right' },
  { label: 'Up', instruction: 'Tilt your head up slightly' },
  { label: 'Down', instruction: 'Tilt your head down slightly' }
];

@Component({
  selector: 'app-staff-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './staff-attendance.component.html',
  styleUrl: './staff-attendance.component.scss'
})
export class StaffAttendanceComponent implements OnInit, OnDestroy {
  @ViewChild('scanVideo') scanVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('enrollVideo') enrollVideoRef?: ElementRef<HTMLVideoElement>;

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  activeTab = signal<'scan' | 'enroll'>('scan');

  modelsLoading = signal(true);
  modelsError = signal<string | null>(null);

  employees = signal<any[]>([]);
  descriptors = signal<FaceDescriptorRow[]>([]);
  private matcher: FaceApi.FaceMatcher | null = null;
  private descriptorRows: FaceDescriptorRow[] = [];

  // Scan tab state
  scanCameraOn = signal(false);
  scanStatus = signal('Camera off.');
  lastResult = signal<{ name: string; action: string; time: string; confidence: number } | null>(null);
  todayList = signal<any[]>([]);
  private scanTimer: any = null;
  private lastRecordedEmployee: number | null = null;
  private lastRecordedAt = 0;
  private lastRecordedAction: string | null = null;
  // Which employee the "already checked in/out" message was last spoken for - so it's spoken
  // once when the debounce window is first hit, not repeated on every 1.5s tick while they
  // stand there (the status text itself is fine to keep refreshing).
  private alreadyNotifiedEmployee: number | null = null;

  // Requires the same person to be matched on 2 consecutive ticks (3s apart) before recording -
  // a single noisy frame (e.g. the first tick right as someone walks up, before their face settles
  // into a good angle/lighting) can otherwise score just above the confidence threshold against
  // the WRONG enrolled face. Confirming across two ticks in a row filters that out.
  private pendingMatchEmployee: number | null = null;
  private pendingMatchCount = 0;

  // GPS location captured once when the camera starts (a device doesn't move meaningfully
  // during one scanning session) and attached to every Check In/Out recorded in that session.
  // null just means the browser denied/couldn't get location - the scan still records normally.
  private currentLocation: { lat: number; lng: number } | null = null;

  // Enroll tab state
  enrollCameraOn = signal(false);
  enrollEmployeeCode = signal<number | null>(null);
  enrollEmployeeText = signal('');
  enrolling = signal(false);
  enrollMessage = signal<string | null>(null);

  // Guided multi-angle capture state - see ENROLL_ANGLES above.
  enrollAngles = ENROLL_ANGLES;
  enrollAngleIndex = signal(0);
  enrollCaptures = signal<{ angleLabel: string; descriptor: Float32Array }[]>([]);
  capturingAngle = signal(false);
  enrollComplete = signal(false);

  // Today's Attendance photo thumbnails - fetched lazily (the photo endpoint needs the JWT, so
  // a plain <img src="..."> can't load it directly; see ensurePhotosLoaded()). '' means "checked,
  // no photo available" so a missing photo isn't retried on every refresh.
  photoUrls = signal<Record<number, string>>({});
  private photoUrlsLoading = new Set<number>();

  private scanStream: MediaStream | null = null;
  private enrollStream: MediaStream | null = null;

  constructor(
    private service: StaffAttendanceService,
    private faceRecognition: FaceRecognitionService,
    private userRightsService: UserRightsService
  ) {}

  ngOnInit(): void {
    this.loadRights();
    this.loadModels();
    this.loadEmployees();
    this.loadDescriptors();
    this.loadTodayList();

    // Chrome loads its voice list asynchronously and getVoices() returns empty until this fires
    // once - calling it now means a real voice list is ready well before the first scan happens.
    window.speechSynthesis?.getVoices();
  }

  ngOnDestroy(): void {
    this.stopScanCamera();
    this.stopEnrollCamera();
    Object.values(this.photoUrls()).forEach(url => { if (url) URL.revokeObjectURL(url); });
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private loadModels(): void {
    this.modelsLoading.set(true);
    this.faceRecognition.loadModels()
      .then(() => { this.modelsLoading.set(false); this.tryBuildMatcher(); })
      .catch(err => {
        this.modelsLoading.set(false);
        console.error('Face model load failed:', err);
        this.modelsError.set('Could not load face recognition models. ' + (err?.message ?? err));
      });
  }

  private loadEmployees(): void {
    this.service.getEmployees().subscribe({ next: rows => this.employees.set(rows ?? []) });
  }

  private loadDescriptors(): void {
    this.service.getFaceDescriptors().subscribe({
      next: rows => {
        this.descriptorRows = rows ?? [];
        this.descriptors.set(this.descriptorRows);
        this.tryBuildMatcher();
      }
    });
  }

  // Same race-avoidance as Labour Attendance - loadModels() and loadDescriptors() run at the
  // same time from ngOnInit with no ordering guarantee, so building the matcher is retried from
  // whichever finishes last.
  private tryBuildMatcher(): void {
    if (this.descriptorRows.length === 0) { this.matcher = null; return; }
    try {
      this.matcher = this.faceRecognition.buildMatcher(this.descriptorRows);
    } catch {
      // Models not loaded yet - loadModels()'s own success handler will retry this.
    }
  }

  private loadTodayList(): void {
    this.service.getList().subscribe({
      next: rows => {
        this.todayList.set(rows ?? []);
        this.ensurePhotosLoaded(rows ?? []);
      }
    });
  }

  private ensurePhotosLoaded(rows: any[]): void {
    const codes = new Set(rows.map(r => this.toNumber(this.read(r, 'EmployeeCode'))).filter(c => c > 0));
    for (const code of codes) {
      if (this.photoUrls()[code] !== undefined || this.photoUrlsLoading.has(code)) continue;
      this.photoUrlsLoading.add(code);
      this.service.getEmployeePhotoBlob(code).subscribe({
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

  isEnrolled(employeeCode: number): boolean {
    return this.descriptors().some(d => this.toNumber(d.employeeCode) === employeeCode);
  }

  // Same type-to-filter pattern for the Enroll tab's Employee field - already-enrolled employees
  // are left out of the datalist entirely (see the template), so re-picking one to accidentally
  // overwrite their face isn't possible from this dropdown.
  private matchEmployeeByText(value: string): any {
    const cleaned = value.trim().toLowerCase();
    return this.employees().find(e => String(this.read(e, 'EmpFullName')).trim().toLowerCase() === cleaned);
  }

  onEnrollEmployeeSelected(value: string): void {
    const emp = this.matchEmployeeByText(value);
    this.enrollEmployeeCode.set(emp ? this.toNumber(this.read(emp, 'EmployeeCode')) : null);
    this.resetEnrollFlow();
  }

  onEnrollEmployeeTextChanged(value: string): void {
    if (!value.trim()) { this.enrollEmployeeCode.set(null); this.resetEnrollFlow(); return; }
    const emp = this.matchEmployeeByText(value);
    this.enrollEmployeeCode.set(emp ? this.toNumber(this.read(emp, 'EmployeeCode')) : null);
    this.resetEnrollFlow();
  }

  private resetEnrollFlow(): void {
    this.enrollAngleIndex.set(0);
    this.enrollCaptures.set([]);
    this.enrollMessage.set(null);
    this.enrollComplete.set(false);
  }

  // ---------- Scan tab ----------
  async startScanCamera(): Promise<void> {
    if (!this.matcher) {
      this.scanStatus.set('No employees enrolled yet - enroll at least one face first.');
      return;
    }
    try {
      this.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (this.scanVideoRef) {
        const video = this.scanVideoRef.nativeElement;
        video.srcObject = this.scanStream;
        try { await video.play(); } catch { /* ignore - already playing or user gesture pending */ }
      }
      this.scanCameraOn.set(true);
      this.scanStatus.set('Scanning...');
      this.scanTimer = setInterval(() => this.scanTick(), 1500);
      this.captureCurrentLocation();
    } catch {
      this.scanStatus.set('Could not access camera - check browser permission.');
    }
  }

  private captureCurrentLocation(): void {
    this.currentLocation = null;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { this.currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => { this.currentLocation = null; },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  stopScanCamera(): void {
    if (this.scanTimer) { clearInterval(this.scanTimer); this.scanTimer = null; }
    this.scanStream?.getTracks().forEach(t => t.stop());
    this.scanStream = null;
    this.currentLocation = null;
    this.scanCameraOn.set(false);
    this.scanStatus.set('Camera off.');
    window.speechSynthesis?.cancel();
  }

  private speak(text: string): void {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    const voice = this.pickFemaleVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  private pickFemaleVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    const englishVoices = voices.filter(v => v.lang?.toLowerCase().startsWith('en'));
    const pool = englishVoices.length > 0 ? englishVoices : voices;

    const femalePattern = /female|zira|susan|samantha|hazel|salli|joanna|kendra|kimberly|amy|emma|olivia|aria|jenny|nova|shimmer/i;
    return pool.find(v => femalePattern.test(v.name)) ?? null;
  }

  private async scanTick(): Promise<void> {
    if (!this.scanVideoRef || !this.matcher) return;
    const descriptor = await this.faceRecognition.getDescriptor(this.scanVideoRef.nativeElement);
    if (!descriptor) {
      this.pendingMatchEmployee = null;
      this.pendingMatchCount = 0;
      this.scanStatus.set('Scanning... (no face detected)');
      return;
    }

    const { employeeCode, confidencePercent } = this.faceRecognition.match(this.matcher, descriptor);
    if (employeeCode == null || confidencePercent < 55) {
      this.pendingMatchEmployee = null;
      this.pendingMatchCount = 0;
      this.scanStatus.set('Face not recognized.');
      return;
    }

    // Require this same employee to be matched on 2 ticks in a row before recording - see
    // pendingMatchEmployee's declaration for why.
    if (this.pendingMatchEmployee !== employeeCode) {
      this.pendingMatchEmployee = employeeCode;
      this.pendingMatchCount = 1;
      this.scanStatus.set('Confirming...');
      return;
    }
    this.pendingMatchCount++;
    if (this.pendingMatchCount < 2) {
      this.scanStatus.set('Confirming...');
      return;
    }
    this.pendingMatchEmployee = null;
    this.pendingMatchCount = 0;

    const emp = this.employees().find(e => this.toNumber(this.read(e, 'EmployeeCode')) === employeeCode);
    const name = emp ? this.read(emp, 'EmpFullName') : `Employee #${employeeCode}`;

    // Debounce - don't re-record the same person again within 2 minutes. Long enough that a
    // moment lingering in front of the camera can never accidentally flip a fresh Check In into
    // a Check Out a few seconds later, short enough that a genuine return trip the same shift
    // (e.g. stepping out and back) still records normally. This used to just `return` silently,
    // leaving whatever status text was on screen a moment earlier (often "Face not recognized"
    // from a mid-scan flicker) - confusing, since the face WAS recognized fine, it's just too
    // soon to record again. Now it says so explicitly.
    const now = Date.now();
    if (this.lastRecordedEmployee === employeeCode && now - this.lastRecordedAt < 120000) {
      const actionLabel = this.lastRecordedAction === 'CheckIn' ? 'checked in' : 'checked out';
      this.scanStatus.set(`${name} already ${actionLabel} - please wait a moment before scanning again.`);
      if (this.alreadyNotifiedEmployee !== employeeCode) {
        this.alreadyNotifiedEmployee = employeeCode;
        this.speak(`${name}, already ${actionLabel}`);
      }
      return;
    }
    this.alreadyNotifiedEmployee = null;

    this.scanStatus.set(`Recognized ${name} (${confidencePercent}%) - recording...`);

    this.service.record(employeeCode, confidencePercent, this.currentLocation?.lat ?? null, this.currentLocation?.lng ?? null).subscribe({
      next: res => {
        this.lastRecordedEmployee = employeeCode;
        this.lastRecordedAt = now;
        this.lastRecordedAction = res.action;
        this.lastResult.set({ name, action: res.action, time: res.time, confidence: confidencePercent });
        this.scanStatus.set(`${res.action === 'CheckIn' ? 'Checked in' : 'Checked out'}: ${name} (${confidencePercent}%)`);
        this.speak(`${name}, ${res.action === 'CheckIn' ? 'checked in' : 'checked out'}`);
        this.loadTodayList();
      },
      error: () => this.scanStatus.set('Could not record attendance - try again.')
    });
  }

  // ---------- Enroll tab ----------
  async startEnrollCamera(): Promise<void> {
    try {
      this.enrollStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (this.enrollVideoRef) {
        const video = this.enrollVideoRef.nativeElement;
        video.srcObject = this.enrollStream;
        try { await video.play(); } catch { /* ignore - already playing or user gesture pending */ }
      }
      this.enrollCameraOn.set(true);
      this.resetEnrollFlow();
    } catch {
      this.enrollMessage.set('Could not access camera - check browser permission.');
    }
  }

  stopEnrollCamera(): void {
    this.enrollStream?.getTracks().forEach(t => t.stop());
    this.enrollStream = null;
    this.enrollCameraOn.set(false);
  }

  // Captures the CURRENT guided angle only (see ENROLL_ANGLES) - once every angle has a capture,
  // the whole set is submitted together and this employee's previous enrollment is replaced.
  async captureCurrentAngle(): Promise<void> {
    const employeeCode = this.enrollEmployeeCode();
    if (!employeeCode) { this.enrollMessage.set('Pick an employee first.'); return; }
    if (!this.enrollVideoRef) return;

    this.capturingAngle.set(true);
    this.enrollMessage.set(null);

    const lighting = this.faceRecognition.checkLighting(this.enrollVideoRef.nativeElement);
    if (!lighting.ok) {
      this.capturingAngle.set(false);
      this.enrollMessage.set(
        lighting.reason === 'dark'
          ? 'Light not clear - move to a brighter, well-lit spot and try again.'
          : 'Too bright / glare on camera - reduce direct light and try again.'
      );
      return;
    }

    const descriptor = await this.faceRecognition.getDescriptor(this.enrollVideoRef.nativeElement);
    this.capturingAngle.set(false);
    if (!descriptor) {
      this.enrollMessage.set('No face detected - face the camera directly and try again.');
      return;
    }

    const angle = this.enrollAngles[this.enrollAngleIndex()];
    this.enrollCaptures.update(list => [...list, { angleLabel: angle.label, descriptor }]);

    if (this.enrollAngleIndex() < this.enrollAngles.length - 1) {
      this.enrollAngleIndex.update(i => i + 1);
    } else {
      this.finishEnrollment(employeeCode);
    }
  }

  private finishEnrollment(employeeCode: number): void {
    this.enrolling.set(true);
    this.service.enroll(employeeCode, this.enrollCaptures()).subscribe({
      next: () => {
        this.enrolling.set(false);
        // Deliberately NOT resetEnrollFlow() here - see LabourAttendanceComponent's own
        // finishEnrollment() for why (keeps the ring/dots at "all done" instead of snapping back
        // to empty in the same instant as the success message).
        this.enrollComplete.set(true);
        // Clear the Employee field itself - now-enrolled, so it drops out of the datalist once
        // loadDescriptors() below refreshes isEnrolled(), and leaving the just-enrolled name
        // sitting in the text box would be misleading (looks pickable again, isn't).
        this.enrollEmployeeCode.set(null);
        this.enrollEmployeeText.set('');
        this.loadDescriptors();
      },
      error: () => { this.enrolling.set(false); this.enrollMessage.set('Could not save this enrollment.'); }
    });
  }

  restartEnrollFlow(): void {
    this.resetEnrollFlow();
  }

  // Face ID-style progress ring around the enroll preview - see LabourAttendanceComponent's own
  // ringGradient() for why.
  ringGradient(): string {
    const percent = this.enrollComplete() ? 100 : Math.round((this.enrollAngleIndex() / this.enrollAngles.length) * 100);
    return `conic-gradient(#2ecc71 ${percent}%, var(--border, #e2e2e2) ${percent}% 100%)`;
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
