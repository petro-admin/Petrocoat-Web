import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface FaceDescriptorRow {
  employeeCode: number;
  empFullName: string;
  descriptor: number[];
}

// Independent sibling of LabourAttendanceService - see staff-attendance.component.ts for why.
// No Job/Sales Order concept anywhere in this module.
@Injectable({ providedIn: 'root' })
export class StaffAttendanceService {
  private base = `${environment.apiBaseUrl}/staffattendance`;

  constructor(private http: HttpClient) {}

  getEmployees(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/employees`);
  }

  getEmployeePhotoBlob(employeeCode: number): Observable<Blob> {
    return this.http.get(`${this.base}/employee-photo/${employeeCode}`, { responseType: 'blob' });
  }

  getFaceDescriptors(): Observable<FaceDescriptorRow[]> {
    return this.http.get<FaceDescriptorRow[]>(`${this.base}/face-descriptors`);
  }

  // Submits the whole guided-capture angle set (Center/Left/Right/Up/Down) at once - the backend
  // replaces this employee's entire previous enrollment with this fresh set.
  enroll(employeeCode: number, captures: { angleLabel: string; descriptor: Float32Array }[]): Observable<any> {
    return this.http.post(`${this.base}/enroll`, {
      employeeCode,
      captures: captures.map(c => ({ angleLabel: c.angleLabel, descriptor: Array.from(c.descriptor) }))
    });
  }

  record(employeeCode: number, matchConfidence: number, latitude: number | null, longitude: number | null): Observable<{ action: string; time: string }> {
    return this.http.post<{ action: string; time: string }>(`${this.base}/record`, { employeeCode, matchConfidence, latitude, longitude });
  }

  getList(date?: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`, date ? { params: { date } } : {});
  }

  getReport(fromDate: string, toDate: string, employeeCode: number | null): Observable<any[]> {
    const params: Record<string, string | number> = { fromDate, toDate };
    if (employeeCode) params['employeeCode'] = employeeCode;
    return this.http.get<any[]>(`${this.base}/report`, { params });
  }
}
