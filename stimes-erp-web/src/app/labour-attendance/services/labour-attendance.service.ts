import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface FaceDescriptorRow {
  employeeCode: number;
  empFullName: string;
  descriptor: number[];
}

@Injectable({ providedIn: 'root' })
export class LabourAttendanceService {
  private base = `${environment.apiBaseUrl}/labourattendance`;

  constructor(private http: HttpClient) {}

  getEmployees(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/employees`);
  }

  getSalesOrders(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/sales-orders`);
  }

  getEmployeesWithPhoto(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/employees-with-photo`);
  }

  // A plain <img src="..."> can't send the Authorization header this [Authorize]-protected
  // endpoint needs, so the photo has to be fetched through HttpClient (which does attach the
  // JWT via the app's interceptor) and turned into a blob URL instead.
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

  record(employeeCode: number, matchConfidence: number, jobCode: number | null, latitude: number | null, longitude: number | null): Observable<{ action: string; time: string }> {
    return this.http.post<{ action: string; time: string }>(`${this.base}/record`, { employeeCode, matchConfidence, jobCode, latitude, longitude });
  }

  getList(date?: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`, date ? { params: { date } } : {});
  }

  getReport(fromDate: string, toDate: string, jobCode: number | null, employeeCode: number | null): Observable<any[]> {
    const params: Record<string, string | number> = { fromDate, toDate };
    if (jobCode) params['jobCode'] = jobCode;
    if (employeeCode) params['employeeCode'] = employeeCode;
    return this.http.get<any[]>(`${this.base}/report`, { params });
  }
}
