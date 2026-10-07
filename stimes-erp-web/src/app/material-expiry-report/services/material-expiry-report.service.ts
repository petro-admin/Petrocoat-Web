import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MaterialExpiryFilters {
  fromDate?: string;
  toDate?: string;
  branchCode?: number;
  warehouse?: string;
  itemCode?: string;
  matCategory?: string;
  supplier?: string;
  expiryStatus?: string;
}

@Injectable({ providedIn: 'root' })
export class MaterialExpiryReportService {
  private base = `${environment.apiBaseUrl}/materialexpiryreport`;

  constructor(private http: HttpClient) {}

  getList(filters: MaterialExpiryFilters): Observable<any[]> {
    const query: Record<string, string> = {};
    if (filters.fromDate) query['fromDate'] = filters.fromDate;
    if (filters.toDate) query['toDate'] = filters.toDate;
    if (filters.branchCode) query['branchCode'] = String(filters.branchCode);
    if (filters.warehouse) query['warehouse'] = filters.warehouse;
    if (filters.itemCode) query['itemCode'] = filters.itemCode;
    if (filters.matCategory) query['matCategory'] = filters.matCategory;
    if (filters.supplier) query['supplier'] = filters.supplier;
    if (filters.expiryStatus) query['expiryStatus'] = filters.expiryStatus;
    return this.http.get<any[]>(`${this.base}/list`, { params: query });
  }

  getWarehouses(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/warehouses`);
  }

  getMaterialCategories(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/material-categories`);
  }

  getMaterials(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/materials`);
  }

  getSuppliers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/suppliers`);
  }
}
