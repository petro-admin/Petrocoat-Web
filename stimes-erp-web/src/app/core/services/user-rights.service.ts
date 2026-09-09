import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserRights {
  access: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
  search: boolean;
  approve: boolean;
}

export const NO_RIGHTS: UserRights = { access: false, add: false, edit: false, delete: false, search: false, approve: false };

/**
 * Generic per-user, per-form rights client - matches the desktop app's
 * Stimes.Erp.Library.UserRights.AssignUserRights (Access/Add/Edit/Delete/Search/Approve),
 * reusable by any form's list/detail component.
 */
@Injectable({ providedIn: 'root' })
export class UserRightsService {
  private base = `${environment.apiBaseUrl}/userrights`;

  constructor(private http: HttpClient) {}

  getRights(formClassName: string): Observable<UserRights> {
    return this.http.get<UserRights>(this.base, { params: { formClassName } });
  }
}
