import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TripSheetService {
  private base = `${environment.apiBaseUrl}/tripsheet`;

  constructor(private http: HttpClient) {}

  getList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`);
  }

  getById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${code}`);
  }

  getLookups(): Observable<{ drivers: any[]; gpsDrivers: any[]; vehicles: any[] }> {
    return this.http.get<{ drivers: any[]; gpsDrivers: any[]; vehicles: any[] }>(`${this.base}/lookups`);
  }

  getGpsSnapshot(vehicleCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/gps-snapshot`, { params: { vehicleCode } });
  }

  getGpsMapping(vehicleCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/gps-mapping`, { params: { vehicleCode } });
  }

  saveGpsMapping(vehicleCode: number, gpsDeviceId: number | null, gpsDeviceName: string): Observable<any> {
    return this.http.post(`${this.base}/gps-mapping`, { vehicleCode, gpsDeviceId, gpsDeviceName });
  }

  getReport(fromDate: string, toDate: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/report`, { params: { fromDate, toDate } });
  }

  getGpsTripReport(fromDate: string, toDate: string, driverCodes: number[], vehicleCodes: number[]): Observable<any[]> {
    const params: Record<string, string | number | number[]> = { fromDate, toDate };
    if (driverCodes.length) params['driverCodes'] = driverCodes;
    if (vehicleCodes.length) params['vehicleCodes'] = vehicleCodes;
    return this.http.get<any[]>(`${this.base}/gps-report`, { params });
  }

  generateDocNo(): Observable<{ docNo: string }> {
    return this.http.get<{ docNo: string }>(`${this.base}/generate-docno`);
  }

  save(payload: any): Observable<any> {
    return this.http.post(`${this.base}/save`, payload);
  }

  delete(code: number): Observable<any> {
    return this.http.delete(`${this.base}/${code}`);
  }
}
