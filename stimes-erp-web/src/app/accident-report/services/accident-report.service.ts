import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AccidentReportService {
  private base = `${environment.apiBaseUrl}/accidentreport`;

  constructor(private http: HttpClient) {}

  getList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`);
  }

  getById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${code}`);
  }

  getDrivers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/drivers`);
  }

  getVehicles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/vehicles`);
  }

  getLastKnownGps(vehicleCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/last-known-gps`, { params: { vehicleCode } });
  }

  generateDocNo(): Observable<{ docNo: string }> {
    return this.http.get<{ docNo: string }>(`${this.base}/generate-docno`);
  }

  uploadPhoto(file: File, branchCode: number): Observable<{ fileName: string; originalName: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ fileName: string; originalName: string }>(`${this.base}/upload`, formData, { params: { branchCode } });
  }

  // A plain <img src="..."> can't send the Authorization header this [Authorize]-protected
  // endpoint needs, so each photo is fetched through HttpClient and turned into a blob URL -
  // same pattern the employee-photo endpoints already use.
  getPhotoBlob(path: string): Observable<Blob> {
    return this.http.get(`${this.base}/photo`, { params: { path }, responseType: 'blob' });
  }

  save(payload: any): Observable<any> {
    return this.http.post(`${this.base}/save`, payload);
  }

  delete(code: number): Observable<any> {
    return this.http.delete(`${this.base}/${code}`);
  }
}
