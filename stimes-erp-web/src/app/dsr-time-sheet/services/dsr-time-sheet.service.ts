import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DsrTimeSheetService {
  private base = `${environment.apiBaseUrl}/dsrtimesheet`;

  constructor(private http: HttpClient) {}

  getList(periodId: number, monthCode = 0): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`, { params: { periodId, monthCode } });
  }

  getById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${code}`);
  }

  // The desktop's "Load" button - pulls that date's attendance from Daily Site, already fully
  // calculated (Basic/OT1/OT2/IDLE/Paid) per employee.
  loadFromDailySite(date: string, periodId: number, branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/load-from-daily-site`, { params: { date, periodId, branchCode } });
  }

  getAttendanceStatuses(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/attendance-statuses`);
  }

  getStandardHours(employeeCode: number, branchCode: number, category: string): Observable<{ hours: number }> {
    return this.http.get<{ hours: number }>(`${this.base}/standard-hours`, { params: { employeeCode, branchCode, category } });
  }

  isHoliday(date: string, branchCode: number): Observable<{ isHoliday: boolean }> {
    return this.http.get<{ isHoliday: boolean }>(`${this.base}/is-holiday`, { params: { date, branchCode } });
  }

  generateDocNo(): Observable<{ dsrNumber: string }> {
    return this.http.get<{ dsrNumber: string }>(`${this.base}/generate-docno`);
  }

  getApprovalSettings(): Observable<{ isApproval: boolean; moduleCode: number; formClassName: string }> {
    return this.http.get<{ isApproval: boolean; moduleCode: number; formClassName: string }>(`${this.base}/approval-settings`);
  }

  save(payload: any): Observable<any> {
    return this.http.post(`${this.base}/save`, payload);
  }

  delete(code: number): Observable<any> {
    return this.http.delete(`${this.base}/${code}`);
  }
}
