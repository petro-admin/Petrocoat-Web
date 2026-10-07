import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ManpowerScheduleService {
  private base = `${environment.apiBaseUrl}/manpowerschedule`;

  constructor(private http: HttpClient) {}

  getSideList(periodId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/side-list`, { params: { periodId } });
  }

  getById(id: number, periodId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${id}`, { params: { periodId } });
  }

  generateDocNo(docDate: string): Observable<{ docNo: string }> {
    return this.http.get<{ docNo: string }>(`${this.base}/generate-docno`, { params: { docDate } });
  }

  getLookups(): Observable<any> {
    return this.http.get<any>(`${this.base}/lookups`);
  }

  checkExistingEmployee(code: number, docDate: string, employeeCode: number): Observable<{ alreadyScheduled: boolean }> {
    return this.http.get<{ alreadyScheduled: boolean }>(`${this.base}/check-existing-employee`, {
      params: { code, docDate, employeeCode }
    });
  }

  getEmployeePickerList(code: number, docDate: string, currentGrid: any[]): Observable<any[]> {
    return this.http.post<any[]>(`${this.base}/employee-picker-list`, currentGrid, { params: { code, docDate } });
  }

  getAllSelectedEmployeeList(data: any[]): Observable<any[]> {
    return this.http.post<any[]>(`${this.base}/all-selected`, data);
  }

  getIdleEmployeeChecking(code: number, docDate: string, currentGrid: any[]): Observable<any[]> {
    return this.http.post<any[]>(`${this.base}/idle-employee-checking`, currentGrid, { params: { code, docDate } });
  }

  getApprovalSettings(): Observable<{ isApproval: boolean; moduleCode: number; formClassName: string }> {
    return this.http.get<{ isApproval: boolean; moduleCode: number; formClassName: string }>(`${this.base}/approval-settings`);
  }

  save(payload: any, branchCode: number, periodId: number): Observable<any> {
    return this.http.post(`${this.base}/save`, payload, { params: { branchCode, periodId } });
  }

  delete(id: number, branchCode: number, periodId: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`, { params: { branchCode, periodId } });
  }
}
