import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginResponse } from './auth.service';

export interface FaceDescriptorRow {
  employeeCode: number;
  empFullName: string;
  descriptor: number[];
}

// Login-time client for FaceLoginController - replaces the old WebAuthnService. Reuses the same
// enrolled-face data Staff/Labour Attendance already has (no separate enrollment flow), so anyone
// enrolled there who also has an active login account becomes face-login-eligible automatically.
@Injectable({ providedIn: 'root' })
export class FaceLoginService {
  private base = `${environment.apiBaseUrl}/facelogin`;

  constructor(private http: HttpClient) {}

  getDescriptors(): Promise<FaceDescriptorRow[]> {
    return firstValueFrom(this.http.get<FaceDescriptorRow[]>(`${this.base}/descriptors`));
  }

  complete(employeeCode: number, confidencePercent: number): Promise<LoginResponse> {
    return firstValueFrom(this.http.post<LoginResponse>(`${this.base}/complete`, { employeeCode, confidencePercent }));
  }
}
