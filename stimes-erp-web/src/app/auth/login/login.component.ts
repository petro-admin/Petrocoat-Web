import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  form!: ReturnType<FormBuilder['group']>;

  showPassword = signal(false);
  errorMessage = signal<string | null>(null);
  loading = signal(false);

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
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
}
