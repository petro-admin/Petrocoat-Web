import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LabourAttendanceService, FaceDescriptorRow } from './services/labour-attendance.service';
import { FaceRecognitionService } from './services/face-recognition.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../core/services/user-rights.service';
// Type-only import - see face-recognition.service.ts for why this must never be a real import here.
import type * as FaceApi from 'face-api.js';

// Matches this.GetType().ToString() in the desktop app's convention - registered in
// AdminModuleInfo (ModuleCode 370).
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.HR.LabourAttendance';

// Guided multi-angle enrollment (like Face ID's turn-your-head capture, minus true depth data -
// this is still 2D photos, just several of them from different angles instead of one). Several
// reference angles per employee gives the matcher a far more representative set to compare
// against, instead of one fragile snapshot that only matches well under the exact lighting/angle
// it was captured in.
const ENROLL_ANGLES: { label: string; instruction: string }[] = [
  { label: 'Center', instruction: 'Look straight at the camera' },
  { label: 'Left', instruction: 'Slowly turn your head to the left' },
  { label: 'Right', instruction: 'Slowly turn your head to the right' },
  { label: 'Up', instruction: 'Tilt your head up slightly' },
  { label: 'Down', instruction: 'Tilt your head down slightly' }
];

@Component({
  selector: 'app-labour-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './labour-attendance.component.html',
  styleUrl: './labour-attendance.component.scss'
})
export class LabourAttendanceComponent implements OnInit, OnDestroy {
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

  // Job (Sales Order) the current scanning session is for - same type-to-filter lookup Daily
  // Site's own Sales Order field uses (a datalist, not a plain dropdown - the real list can be
  // long). Selected once, carried on every Check In/Out recorded while set.
  salesOrders = signal<any[]>([]);
  jobCode = signal<number | null>(null);
  jobNoText = signal('');

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
  // during one scanning session) and attached to every Check In/Out recorded in that session -
  // so a supervisor can verify via the Labour Attendance Report where a scan actually happened.
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

  // Bulk-enroll-from-existing-photo state
  employeesWithPhoto = signal<any[]>([]);
  bulkEnrolling = signal(false);
  bulkEnrollLog = signal<string[]>([]);

  // Today's Attendance photo thumbnails - fetched lazily (the photo endpoint needs the JWT, so
  // a plain <img src="..."> can't load it directly; see ensurePhotosLoaded()). '' means "checked,
  // no photo available" so a missing photo isn't retried on every refresh.
  photoUrls = signal<Record<number, string>>({});
  private photoUrlsLoading = new Set<number>();

  private scanStream: MediaStream | null = null;
  private enrollStream: MediaStream | null = null;

  constructor(
    private service: LabourAttendanceService,
    private faceRecognition: FaceRecognitionService,
    private userRightsService: UserRightsService
  ) {}

  ngOnInit(): void {
    this.loadRights();
    this.loadModels();
    this.loadEmployees();
    this.loadDescriptors();
    this.loadTodayList();
    this.loadSalesOrders();
    // Bulk-enroll-from-existing-photo is hidden for now (manual camera enrollment only per
    // request) - loadEmployeesWithPhoto()/bulkEnrollFromPhotos() are still here, unused, so it's
    // easy to bring back later if needed.

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

  // loadModels() (downloading several MB of model files) and loadDescriptors() (a quick DB
  // fetch) run at the same time from ngOnInit with no ordering guarantee - on a slow connection
  // the descriptors can arrive well before the models finish, so building the matcher is tried
  // again from whichever of the two finishes last, instead of only once at the moment the
  // descriptors arrive (which used to silently leave the matcher unset if models were still
  // loading at that exact instant, blocking Start Camera even though employees were enrolled).
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

  // Fetches each not-yet-seen employee's photo once (as an authenticated blob, see
  // LabourAttendanceService.getEmployeePhotoBlob) and caches the resulting object URL - avoids
  // re-fetching the same person's photo every time the attendance list refreshes.
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

  private loadSalesOrders(): void {
    this.service.getSalesOrders().subscribe({ next: rows => this.salesOrders.set(rows ?? []) });
  }

  private loadEmployeesWithPhoto(): void {
    this.service.getEmployeesWithPhoto().subscribe({ next: rows => this.employeesWithPhoto.set(rows ?? []) });
  }

  isEnrolled(employeeCode: number): boolean {
    return this.descriptors().some(d => this.toNumber(d.employeeCode) === employeeCode);
  }

  // Same type-to-filter matching Daily Site's own Sales Order field uses (onSalesOrderSelected/
  // onSalesOrderTextChanged) - resolves the typed text against the datalist options and sets
  // jobCode only once it matches a real Sales Order exactly.
  onJobSelected(value: string): void {
    const order = this.salesOrders().find(so => String(this.read(so, 'SONo')).trim().toLowerCase() === value.trim().toLowerCase());
    this.jobCode.set(order ? this.toNumber(this.read(order, 'SOCode')) : null);
  }

  onJobTextChanged(value: string): void {
    if (!value.trim()) { this.jobCode.set(null); return; }
    const order = this.salesOrders().find(so => String(this.read(so, 'SONo')).trim().toLowerCase() === value.trim().toLowerCase());
    this.jobCode.set(order ? this.toNumber(this.read(order, 'SOCode')) : null);
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
        // Some browsers don't actually start rendering frames from a JS-assigned srcObject
        // until .play() is called explicitly, even with the autoplay attribute present -
        // without this the feed just shows as a black box.
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

  // Fire-and-forget - doesn't block the camera/scanning from starting. A short timeout so a
  // slow/denied location prompt never leaves scanning waiting on it.
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

  // Browser's built-in text-to-speech - no library, no cost, works offline. Cancels any
  // still-speaking utterance first so back-to-back scans don't queue up and talk over the
  // current status (a labourer standing at the camera shouldn't wait through a backlog).
  private speak(text: string): void {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    const voice = this.pickFemaleVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  // The Web Speech API doesn't expose a "gender" field on voices - only a name (e.g. "Microsoft
  // Zira", "Google UK English Female", "Samantha") - so a female voice is picked by matching
  // common name patterns among whatever voices this browser/OS has installed. Falls back to the
  // browser's default voice if nothing matches. Voices load asynchronously in some browsers
  // (empty on the very first call), so this re-checks each time rather than caching a miss.
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
    // Second, app-level gate on top of the matcher's own distance cutoff - reject anything
    // borderline instead of accepting a weak/uncertain match as if it were confidently correct.
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

    this.service.record(employeeCode, confidencePercent, this.jobCode(), this.currentLocation?.lat ?? null, this.currentLocation?.lng ?? null).subscribe({
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
        // Deliberately NOT resetEnrollFlow() here - that would snap the ring/dots back to empty
        // in the same instant as saying "enrolled successfully", which reads as a contradiction.
        // enrollComplete keeps the ring at 100% and all dots green until the person explicitly
        // moves on (restartEnrollFlow, picking a different employee, or leaving the tab).
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

  // Face ID-style progress ring around the enroll preview - a conic-gradient sweep that fills in
  // as each guided angle is captured, so the person can see how far through the 5 angles they are.
  ringGradient(): string {
    const percent = this.enrollComplete() ? 100 : Math.round((this.enrollAngleIndex() / this.enrollAngles.length) * 100);
    return `conic-gradient(#2ecc71 ${percent}%, var(--border, #e2e2e2) ${percent}% 100%)`;
  }

  // ---------- Bulk enroll from existing ERP photos ----------
  // Skips the live camera entirely - loads each employee's already-uploaded photo
  // (payrollEmployeeInfo.EmpPhoto, streamed through our own API since the browser can't load
  // the underlying UNC file path directly), runs face detection on it, and enrolls it. Only
  // works for employees whose stored photo is a clear, front-facing face.
  async bulkEnrollFromPhotos(): Promise<void> {
    const targets = this.employeesWithPhoto().filter(e => !this.isEnrolled(this.toNumber(this.read(e, 'EmployeeCode'))));
    if (targets.length === 0) {
      this.bulkEnrollLog.set(['All employees with a photo are already enrolled.']);
      return;
    }

    this.bulkEnrolling.set(true);
    this.bulkEnrollLog.set([`Starting - ${targets.length} employee(s) to try...`]);

    for (const emp of targets) {
      const employeeCode = this.toNumber(this.read(emp, 'EmployeeCode'));
      const name = this.read(emp, 'EmpFullName');
      let objectUrl: string | null = null;
      try {
        const blob = await firstValueFrom(this.service.getEmployeePhotoBlob(employeeCode));
        objectUrl = URL.createObjectURL(blob);
        const img = await this.loadImage(objectUrl);
        const descriptor = await this.faceRecognition.getDescriptor(img);
        if (!descriptor) {
          this.appendLog(`${name}: no face detected in photo - skipped.`);
          continue;
        }
        await firstValueFrom(this.service.enroll(employeeCode, [{ angleLabel: 'Center', descriptor }]));
        this.appendLog(`${name}: enrolled (single photo - re-enroll via camera for better accuracy).`);
      } catch {
        this.appendLog(`${name}: could not load photo (file may not be reachable from the server) - skipped.`);
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    }

    this.bulkEnrolling.set(false);
    this.appendLog('Done.');
    this.loadDescriptors();
  }

  private appendLog(line: string): void {
    this.bulkEnrollLog.update(log => [...log, line]);
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = url;
    });
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
