import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class StoreIndentService {
  private base = `${environment.apiBaseUrl}/storeindent`;

  constructor(private http: HttpClient) {}

  getList(branchCode: number, month: number, periodId: number, year: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`, { params: { branchCode, month, periodId, year } });
  }

  getById(id: number, branchCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${id}`, { params: { branchCode } });
  }

  generateDocNo(periodId: number): Observable<{ docNo: string }> {
    return this.http.get<{ docNo: string }>(`${this.base}/generate-docno`, { params: { periodId } });
  }

  getLookups(branchCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/lookups`, { params: { branchCode } });
  }

  getItemLookup(typeCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/item-lookup`, { params: { typeCode } });
  }

  getItemSpec(itemCode: number, typeCode: number, periodId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/item-spec`, { params: { itemCode, typeCode, periodId } });
  }

  getSalesOrderEstimation(soCode: number, periodId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/sales-order/${soCode}/estimation`, { params: { periodId } });
  }

  getEmployeeDesignation(employeeCode: number): Observable<{ designation: string }> {
    return this.http.get<{ designation: string }>(`${this.base}/employee-designation`, { params: { employeeCode } });
  }

  save(payload: any, companyCode: number, branchCode: number, periodId: number): Observable<any> {
    return this.http.post(`${this.base}/save`, payload, { params: { companyCode, branchCode, periodId } });
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
