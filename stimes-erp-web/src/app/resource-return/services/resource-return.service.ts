import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ResourceReturnService {
  private base = `${environment.apiBaseUrl}/resourcereturn`;

  constructor(private http: HttpClient) {}

  generateDocNo(): Observable<{ matReturnNo: string }> {
    return this.http.get<{ matReturnNo: string }>(`${this.base}/generate-docno`);
  }

  getIssueList(branchCode: number, periodId: number, companyCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/issues`, { params: { branchCode, periodId, companyCode } });
  }

  getIssueInfo(matIssueCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/issues/${matIssueCode}`);
  }

  getMaterialsForIssue(matIssueCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/issues/${matIssueCode}/materials`);
  }

  getConsumablesForIssue(matIssueCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/issues/${matIssueCode}/consumables`);
  }

  getTaeForIssue(matIssueCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/issues/${matIssueCode}/tools-equipment`);
  }

  getGeneralForIssue(matIssueCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/issues/${matIssueCode}/general-services`);
  }

  getSubContractForIssue(matIssueCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/issues/${matIssueCode}/subcontract`);
  }

  getTaeHireForIssue(matIssueCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/issues/${matIssueCode}/tools-equipment-hire`);
  }

  getLookups(branchCode: number, companyCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/lookups`, { params: { branchCode, companyCode } });
  }

  getList(periodId: number, branchCode: number, companyCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/list`, { params: { periodId, branchCode, companyCode } });
  }

  getById(matReturnCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${matReturnCode}`);
  }

  uploadDocument(file: File, branchCode: number): Observable<{ fileName: string; originalName: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ fileName: string; originalName: string }>(`${this.base}/upload`, formData, { params: { branchCode } });
  }

  downloadDocument(path: string): Observable<Blob> {
    return this.http.get(`${this.base}/documents`, { params: { path }, responseType: 'blob' });
  }

  save(payload: any, branchCode: number, companyCode: number, periodId: number): Observable<any> {
    return this.http.post(`${this.base}/save`, payload, { params: { branchCode, companyCode, periodId } });
  }

  delete(matReturnCode: number, branchCode: number, companyCode: number): Observable<any> {
    return this.http.delete(`${this.base}/${matReturnCode}`, { params: { branchCode, companyCode } });
  }
}
