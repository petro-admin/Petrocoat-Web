import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class VehicleHandoverService {
  private base = `${environment.apiBaseUrl}/vehiclehandover`;

  constructor(private http: HttpClient) {}

  getList(branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`, { params: { branchCode } });
  }

  getById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${code}`);
  }

  getVehicles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/vehicles`);
  }

  getEmployees(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/employees`);
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
  // endpoint needs, so the photo is fetched through HttpClient and turned into a blob URL.
  getPhotoBlob(path: string): Observable<Blob> {
    return this.http.get(`${this.base}/photo`, { params: { path }, responseType: 'blob' });
  }

  save(payload: any, branchCode: number): Observable<any> {
    return this.http.post(`${this.base}/save`, payload, { params: { branchCode } });
  }

  delete(code: number): Observable<any> {
    return this.http.delete(`${this.base}/${code}`);
  }
}
