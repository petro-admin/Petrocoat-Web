import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DashboardKpis {
  currencyCode: string;
  currencyWarning: string | null;
  salesInvoice: { totalValue: number; count: number };
  purchaseInvoice: { totalValue: number; count: number };
  stockValue: { totalValue: number; itemCount: number };
  salesFollowup: { bookedCount: number; bookedAmount: number };
  attendance: {
    asOfDate: string | null;
    presentCount: number;
    absentCount: number;
    onLeaveCount: number;
    totalMarked: number;
    attendancePercent: number;
  };
  salesActivity: { enquiryCount: number; siteVisitCount: number };
  workforce: {
    staffCount: number;
    driverCount: number;
    labourCount: number;
    subContractCount: number;
    totalEmployeeCount: number;
  };
  trend: { monthLabel: string; salesValue: number; purchaseValue: number }[];
}

export interface DashboardBranch {
  branchCode: number;
  branchName: string;
}

export interface DashboardDepartment {
  departmentCode: number;
  departmentName: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private base = `${environment.apiBaseUrl}/dashboard`;

  constructor(private http: HttpClient) {}

  getBranches(): Observable<DashboardBranch[]> {
    return this.http.get<DashboardBranch[]>(`${this.base}/branches`);
  }

  getDepartments(): Observable<DashboardDepartment[]> {
    return this.http.get<DashboardDepartment[]>(`${this.base}/departments`);
  }

  getKpis(fromDate: string, toDate: string, branchCode?: string | null, departmentCode?: number | null): Observable<DashboardKpis> {
    const params: Record<string, string> = { fromDate, toDate };
    if (branchCode) params['branchCode'] = branchCode;
    if (departmentCode) params['departmentCode'] = String(departmentCode);
    return this.http.get<DashboardKpis>(`${this.base}/kpis`, { params });
  }
}
