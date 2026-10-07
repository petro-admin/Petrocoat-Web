import { Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { FaceLoginService } from '../../core/services/face-login.service';
import { FaceRecognitionService } from '../../labour-attendance/services/face-recognition.service';
import type * as FaceApi from 'face-api.js';

// How many consecutive scan ticks must agree on the same employee before a login attempt fires -
// same debounce Labour Attendance's own scanner uses, just required for every single login
// (not recorded once then left alone) since logging in is a one-shot, higher-stakes action.
const REQUIRED_CONSECUTIVE_MATCHES = 2;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnDestroy {
  @ViewChild('faceVideo') faceVideoRef?: ElementRef<HTMLVideoElement>;

  form!: ReturnType<FormBuilder['group']>;

  showPassword = signal(false);
  errorMessage = signal<string | null>(null);
  loading = signal(false);

  // Replaces the old WebAuthn-based Fingerprint/Screen-Touch buttons - reuses the same
  // face-recognition enrollment Staff/Labour Attendance already has, so anyone enrolled there
  // with an active login account can sign in this way with no separate per-device setup.
  faceLoginOpen = signal(false);
  faceStatus = signal('Starting camera...');
  faceBusy = signal(false);

  private stream: MediaStream | null = null;
  private scanTimer: any = null;
  private matcher: FaceApi.FaceMatcher | null = null;
  private pendingMatchEmployee: number | null = null;
  private pendingMatchCount = 0;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private faceLoginService: FaceLoginService,
    private faceRecognition: FaceRecognitionService,
    private router: Router
  ) {
    this.form = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  ngOnDestroy(): void {
    this.stopFaceLogin();
  }

  get usernameControl() {
    return this.form.get('username');
  }

  get passwordControl() {
    return this.form.get('password');
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    const { username, password } = this.form.getRawValue();
    this.auth.login(username!, password!).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message ?? (
          err.status === 503
            ? 'System is under maintenance'
            : err.status === 401
              ? 'Invalid username or password'
              : 'Unable to connect to the ERP server'
        ));
      }
    });
  }

  // ---------- Face Login ----------
  async startFaceLogin(): Promise<void> {
    this.errorMessage.set(null);
    this.faceLoginOpen.set(true);
    this.faceBusy.set(true);
    this.faceStatus.set('Loading face recognition...');
    this.pendingMatchEmployee = null;
    this.pendingMatchCount = 0;

    try {
      const [, descriptors] = await Promise.all([
        this.faceRecognition.loadModels(),
        this.faceLoginService.getDescriptors()
      ]);

      if (descriptors.length === 0) {
        this.faceStatus.set('No one is enrolled for face login yet - please use your password.');
        this.faceBusy.set(false);
        return;
      }
      this.matcher = this.faceRecognition.buildMatcher(descriptors);

      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (this.faceVideoRef) {
        const video = this.faceVideoRef.nativeElement;
        video.srcObject = this.stream;
        try { await video.play(); } catch { /* ignore - already playing or user gesture pending */ }
      }

      this.faceBusy.set(false);
      this.faceStatus.set('Look at the camera...');
      this.scanTimer = setInterval(() => this.scanTick(), 1200);
    } catch {
      this.faceBusy.set(false);
      this.faceStatus.set('Could not access the camera - check browser permission, or use your password.');
    }
  }

  stopFaceLogin(): void {
    if (this.scanTimer) { clearInterval(this.scanTimer); this.scanTimer = null; }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.matcher = null;
    this.faceLoginOpen.set(false);
    this.faceBusy.set(false);
  }

  private async scanTick(): Promise<void> {
    if (!this.faceVideoRef || !this.matcher || this.faceBusy()) return;

    const descriptor = await this.faceRecognition.getDescriptor(this.faceVideoRef.nativeElement);
    if (!descriptor) {
      this.pendingMatchEmployee = null;
      this.pendingMatchCount = 0;
      this.faceStatus.set('Look at the camera... (no face detected)');
      return;
    }

    const { employeeCode, confidencePercent } = this.faceRecognition.match(this.matcher, descriptor);
    // Matches the backend's own FaceLoginService.MinConfidencePercent floor - no point starting a
    // login attempt the server will just reject, and it keeps the on-screen status accurate. 65%
    // is the face-api.js matcher's own natural floor (its 0.35 distance cutoff never reports a
    // match below that) - an earlier, higher value here rejected most genuine attempts, not just
    // weak ones, since this app's own real-world matches typically land around 55-76%.
    if (employeeCode == null || confidencePercent < 65) {
      this.pendingMatchEmployee = null;
      this.pendingMatchCount = 0;
      this.faceStatus.set('Face not recognized.');
      return;
    }

    if (this.pendingMatchEmployee !== employeeCode) {
      this.pendingMatchEmployee = employeeCode;
      this.pendingMatchCount = 1;
      this.faceStatus.set('Confirming...');
      return;
    }
    this.pendingMatchCount++;
    if (this.pendingMatchCount < REQUIRED_CONSECUTIVE_MATCHES) {
      this.faceStatus.set('Confirming...');
      return;
    }

    // Stop scanning the instant a confident, confirmed match is found - the completion request
    // below is a one-shot attempt, not something that should keep firing every tick while it's
    // in flight.
    if (this.scanTimer) { clearInterval(this.scanTimer); this.scanTimer = null; }
    this.faceBusy.set(true);
    this.faceStatus.set(`Recognized (${confidencePercent}%) - signing in...`);

    try {
      const res = await this.faceLoginService.complete(employeeCode, confidencePercent);
      this.auth.setSession(res);
      this.stopFaceLogin();
      this.router.navigate(['/']);
    } catch {
      this.faceStatus.set('Face recognized, but no login account is linked - please use your password.');
      this.faceBusy.set(false);
      this.pendingMatchEmployee = null;
      this.pendingMatchCount = 0;
      this.scanTimer = setInterval(() => this.scanTick(), 1200);
    }
  }
}
