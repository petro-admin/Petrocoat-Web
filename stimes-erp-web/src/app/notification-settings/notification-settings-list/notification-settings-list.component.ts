import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationSettingsService } from '../services/notification-settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

// Web-only form (no desktop equivalent) - a desktop-class-name-shaped key so it slots into the
// existing usp_GetUserRightSecurity rights table the same way the Fingerprint Login form does.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.SystemAdmin.NotificationSettings';

@Component({
  selector: 'app-notification-settings-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-settings-list.component.html',
  styleUrl: './notification-settings-list.component.scss'
})
export class NotificationSettingsListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private service: NotificationSettingsService,
    private router: Router,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {}

  ngOnInit(): void {
    this.refresh();
    this.loadRights();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getList().subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load Notification Settings.'); this.loading.set(false); }
    });
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/notification-settings/0']);
  }

  open(row: any): void {
    this.router.navigate(['/notification-settings', this.read(row, 'Code')]);
  }

  // Short badge like "Create, Approve" - matches the On* flags at a glance without needing a
  // separate column per event type (would be five mostly-empty columns for most rows).
  events(row: any): string {
    const labels: string[] = [];
    if (this.isOn(row, 'OnCreate')) labels.push('Create');
    if (this.isOn(row, 'OnUpdate')) labels.push('Update');
    if (this.isOn(row, 'OnDelete')) labels.push('Delete');
    if (this.isOn(row, 'OnApprove')) labels.push('Approve');
    if (this.isOn(row, 'OnDeny')) labels.push('Deny');
    return labels.length ? labels.join(', ') : '-';
  }

  private isOn(row: any, key: string): boolean {
    const value = this.read(row, key);
    return value === true || value === 1 || value === '1' || value === 'Y';
  }

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();
    const code = Number(this.read(row, 'Code'));
    if (!code) return;

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete this notification setting ?'))) return;

    this.deleting.set(true);
    this.service.delete(code).subscribe({
      next: res => {
        this.deleting.set(false);
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.refresh();
      },
      error: () => { this.deleting.set(false); this.errorMessage.set('Could not delete the record.'); }
    });
  }

  read(record: any, ...keys: string[]): any {
    if (!record) return undefined;
    for (const key of keys) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (record[key] !== undefined) return record[key];
      if (record[camelKey] !== undefined) return record[camelKey];
    }
    return undefined;
  }
}
