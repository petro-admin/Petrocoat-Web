import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private base = `${environment.apiBaseUrl}/auditlog`;

  constructor(private http: HttpClient) {}

  getList(params: {
    branchCode: number; fromDate?: string; toDate?: string; userCode?: number; action?: string; search?: string;
  }): Observable<any[]> {
    const query: Record<string, string> = { branchCode: String(params.branchCode) };
    if (params.fromDate) query['fromDate'] = params.fromDate;
    if (params.toDate) query['toDate'] = params.toDate;
    if (params.userCode) query['userCode'] = String(params.userCode);
    if (params.action) query['action'] = params.action;
    if (params.search) query['search'] = params.search;
    return this.http.get<any[]>(`${this.base}/list`, { params: query });
  }

  getUsers(branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/users`, { params: { branchCode } });
  }
}
