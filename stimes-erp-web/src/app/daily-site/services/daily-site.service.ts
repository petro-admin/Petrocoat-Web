import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DailySiteService {
  private base = `${environment.apiBaseUrl}/dailysite`;

  constructor(private http: HttpClient) {}

  getList(month: number, year: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`, { params: { month, year } });
  }

  getById(id: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${id}`);
  }

  generateDocNo(docDate: string): Observable<{ docNo: string }> {
    return this.http.get<{ docNo: string }>(`${this.base}/generate-docno`, { params: { docDate } });
  }

  getSalesOrders(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/sales-orders`);
  }

  getSalesOrderDetails(soCode: number, basic: number, dailySiteCode: number, itemCode: number, docDate: string): Observable<any[][]> {
    return this.http.get<any[][]>(`${this.base}/sales-orders/${soCode}/details`, {
      params: { basic, dailySiteCode, itemCode, docDate }
    });
  }

  getExistingSalesOrders(soCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/sales-orders/${soCode}/revisions`);
  }

  getLookups(): Observable<any> {
    return this.http.get<any>(`${this.base}/lookups`);
  }

  getEmployeeHourContext(employeeCode: number, docDate: string, dailySiteCode: number, branchCode: number, periodId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/employee-hour-context`, {
      params: { employeeCode, docDate, dailySiteCode, branchCode, periodId }
    });
  }

  getScopeOfWorkContext(jobCode: number, surfacePreparationCode: number, dailySiteCode: number, scopeOfWorkAsPerJobCard: number, slNo: number, specialRequirement: string): Observable<any> {
    return this.http.get<any>(`${this.base}/scope-of-work-context`, {
      params: { jobCode, surfacePreparationCode, dailySiteCode, scopeOfWorkAsPerJobCard, slNo, specialRequirement }
    });
  }

  getMaterialPreviousDetail(jobCode: number, dailySiteCode: number, materialCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/material-previous-detail`, {
      params: { jobCode, dailySiteCode, materialCode }
    });
  }

  getMaterialPrevTotalUsed(jobCode: number, dailySiteCode: number, materialCode: number): Observable<{ totalUsed: number }> {
    return this.http.get<{ totalUsed: number }>(`${this.base}/material-prev-total-used`, {
      params: { jobCode, dailySiteCode, materialCode }
    });
  }

  getConsumablePreviousDetail(jobCode: number, dailySiteCode: number, consumableCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/consumable-previous-detail`, {
      params: { jobCode, dailySiteCode, consumableCode }
    });
  }

  getReport(id: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${id}/report`);
  }

  getDemoMaterial(jobCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/demo-material`, { params: { jobCode } });
  }

  getDemoScopeHrs(jobCode: number): Observable<{ scopeHrs: string }> {
    return this.http.get<{ scopeHrs: string }>(`${this.base}/demo-scopehrs`, { params: { jobCode } });
  }

  save(payload: any, branchCode: number, periodId: number): Observable<any> {
    return this.http.post(`${this.base}/save`, payload, { params: { branchCode, periodId } });
  }

  delete(id: number, branchCode: number, periodId: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`, { params: { branchCode, periodId } });
  }
}
