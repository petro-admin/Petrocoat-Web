import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LeaveApplicationService {
  private base = `${environment.apiBaseUrl}/leaveapplication`;

  constructor(private http: HttpClient) {}

  getList(year: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`, { params: { year } });
  }

  getById(requestId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${requestId}`);
  }

  getLeaveTypes(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/leave-types`);
  }

  getEmployees(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/employees`);
  }

  getAvailableBalance(employeeCode: number, requestTypeCode: number, asOnDate: string): Observable<any> {
    return this.http.get<any>(`${this.base}/available-balance`, { params: { employeeCode, requestTypeCode, asOnDate } });
  }

  generateDocNo(): Observable<{ requestNo: string }> {
    return this.http.get<{ requestNo: string }>(`${this.base}/generate-docno`);
  }

  uploadDocument(file: File, branchCode: number): Observable<{ fileName: string; originalName: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ fileName: string; originalName: string }>(`${this.base}/upload`, formData, { params: { branchCode } });
  }

  downloadDocument(path: string): Observable<Blob> {
    return this.http.get(`${this.base}/documents`, { params: { path }, responseType: 'blob' });
  }

  save(payload: any, periodId: number, branchCode: number, companyCode: number): Observable<any> {
    return this.http.post(`${this.base}/save`, payload, { params: { periodId, branchCode, companyCode } });
  }

  delete(requestId: number, requestNo: string, periodId: number, branchCode: number, companyCode: number): Observable<any> {
    return this.http.delete(`${this.base}/${requestId}`, { params: { requestNo, periodId, branchCode, companyCode } });
  }
}
