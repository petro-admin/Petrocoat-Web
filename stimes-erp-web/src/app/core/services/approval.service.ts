import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApprovalSettings {
  isApproval: boolean;
  moduleCode: number;
}

export interface ApprovalStatus {
  visible: boolean;
  action?: any;
}

/**
 * Generic Lock/Approve/Deny workflow client - matches the desktop app's shared
 * Cls_Authorization/AdminApprovalSettings usage, reusable by any form's detail component.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalService {
  private base = `${environment.apiBaseUrl}/approval`;

  constructor(private http: HttpClient) {}

  getSettings(formClassName: string): Observable<ApprovalSettings> {
    return this.http.get<ApprovalSettings>(`${this.base}/settings`, { params: { formClassName } });
  }

  getStatus(moduleCode: number, transactionCode: number): Observable<ApprovalStatus> {
    return this.http.get<ApprovalStatus>(`${this.base}/status`, { params: { moduleCode, transactionCode } });
  }

  manageAction(moduleCode: number, transactionCode: number, activity: string, action: string, comment: string): Observable<any> {
    return this.http.post(`${this.base}/action`, { moduleCode, transactionCode, activity, action, comment });
  }

  getHistory(moduleCode: number, transactionCode: number): Observable<any[][]> {
    return this.http.get<any[][]>(`${this.base}/history`, { params: { moduleCode, transactionCode } });
  }

  verify(formClassName: string, transactionCode: number): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base}/verify`, { params: { formClassName, transactionCode } });
  }

  clearActions(formClassName: string, transactionCode: number, moduleCode: number): Observable<{ result: string }> {
    return this.http.post<{ result: string }>(`${this.base}/clear-actions`, null, { params: { formClassName, transactionCode, moduleCode } });
  }
}
