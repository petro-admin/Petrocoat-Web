import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface NotificationSettingsSaveRequest {
  code: number;
  formClassName: string;
  formName: string;
  systemCode: number;
  moduleTypeCode: number;
  moduleCode: number;
  onCreate: boolean;
  onUpdate: boolean;
  onDelete: boolean;
  onApprove: boolean;
  onDeny: boolean;
  active: boolean;
  userCodes: number[];
}

// Admin configuration side (who gets notified, for which form/events) - see
// core/services/notification.service.ts for the bell-panel/delivery side every user hits.
@Injectable({ providedIn: 'root' })
export class NotificationSettingsService {
  private base = `${environment.apiBaseUrl}/notificationsettings`;

  constructor(private http: HttpClient) {}

  getSystems() { return this.http.get<any[]>(`${this.base}/systems`); }
  getModuleTypes() { return this.http.get<any[]>(`${this.base}/module-types`); }
  getForms(systemCode: number, moduleTypeCode: number) {
    return this.http.get<any[]>(`${this.base}/forms`, { params: { systemCode, moduleTypeCode } });
  }
  getUsers() { return this.http.get<any[]>(`${this.base}/users`); }

  getList() { return this.http.get<any[]>(`${this.base}/list`); }
  getById(code: number) { return this.http.get<any>(`${this.base}/${code}`); }

  save(request: NotificationSettingsSaveRequest) {
    return this.http.post<{ result: string; code: number }>(`${this.base}/save`, request);
  }

  delete(code: number) {
    return this.http.delete<{ result: string }>(`${this.base}/${code}`);
  }
}
