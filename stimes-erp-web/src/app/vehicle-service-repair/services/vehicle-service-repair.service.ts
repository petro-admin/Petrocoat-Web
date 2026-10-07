import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class VehicleServiceRepairService {
  private base = `${environment.apiBaseUrl}/vehicleservicerepair`;

  constructor(private http: HttpClient) {}

  getList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`);
  }

  getById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${code}`);
  }

  getVehicles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/vehicles`);
  }

  getDrivers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/drivers`);
  }

  getInspectionChecklist(vehicleCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/inspection-checklist`, { params: { vehicleCode } });
  }

  generateDocNo(): Observable<{ docNo: string }> {
    return this.http.get<{ docNo: string }>(`${this.base}/generate-docno`);
  }

  // branchCode picks which shared network path (payrollSettings.ServerPath) the file is saved
  // under - same convention desktop uses for every document/photo upload.
  uploadDocument(file: File, branchCode: number): Observable<{ fileName: string; originalName: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ fileName: string; originalName: string }>(`${this.base}/upload`, formData, { params: { branchCode } });
  }

  // fileName here is the full UNC path returned by uploadDocument/saved in DocUpload, not a
  // bare filename - passed as a query param since it contains backslashes.
  downloadDocument(fileName: string): Observable<Blob> {
    return this.http.get(`${this.base}/documents`, { params: { path: fileName }, responseType: 'blob' });
  }

  save(payload: any, periodId: number): Observable<any> {
    return this.http.post(`${this.base}/save`, payload, { params: { periodId } });
  }

  delete(code: number, periodId: number): Observable<any> {
    return this.http.delete(`${this.base}/${code}`, { params: { periodId } });
  }
}
