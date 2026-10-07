import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface AppNotification {
  Code: number;
  FormClassName: string;
  FormName: string;
  EventType: string;
  RefNo: string;
  Message: string;
  ActorName: string;
  IsRead: boolean;
  CreatedDate: string;
}

// Bell-panel client - the delivery side of the notification system. The admin configuration side
// (who gets notified, for which form/events) is a separate module (notification-settings), this
// service is only what every logged-in user's own shell topbar bell uses.
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private base = `${environment.apiBaseUrl}/notifications`;

  unreadCount = signal(0);

  constructor(private http: HttpClient) {}

  refreshUnreadCount(): void {
    this.http.get<{ count: number }>(`${this.base}/unread-count`).subscribe({
      next: res => this.unreadCount.set(res?.count ?? 0),
      error: () => {}
    });
  }

  getMine(unreadOnly = false) {
    return this.http.get<AppNotification[]>(`${this.base}/mine`, { params: { unreadOnly } });
  }

  markRead(code: number) {
    return this.http.post(`${this.base}/${code}/read`, null);
  }

  markAllRead() {
    return this.http.post(`${this.base}/read-all`, null);
  }
}
