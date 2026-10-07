import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ResourceReportType = 'material' | 'consumable' | 'tae';

@Injectable({ providedIn: 'root' })
export class ResourceReportService {
  private base = `${environment.apiBaseUrl}/resourcereport`;

  constructor(private http: HttpClient) {}

  getReport(type: ResourceReportType, fromDate: string, toDate: string, soCode: number, branchCodes: number[], itemCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/${type}`, {
      params: { fromDate, toDate, soCode, branchCodes: branchCodes.join(','), itemCode }
    });
  }

  getLookups(): Observable<any> {
    return this.http.get<any>(`${this.base}/lookups`);
  }
}
