import { Component, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogService } from '../services/audit-log.service';
import { SettingsService } from '../../core/services/settings.service';

// Action codes match desktop's own usp_ManageUserAudit convention ('A' = Add, 'E' = Edit) - 'D'
// (Delete) is included for completeness even though no sampled desktop save flow was confirmed
// to pass it, since the SP itself places no restriction on the value.
const ACTION_LABELS: Record<string, string> = { A: 'Added', E: 'Edited', D: 'Deleted' };

@Component({
  selector: 'app-audit-log-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-log-list.component.html',
  styleUrl: './audit-log-list.component.scss'
})
export class AuditLogListComponent {
  rows = signal<any[]>([]);
  users = signal<any[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  // Defaults to the full current calendar month (1st through its last day), matching the
  // Month/Year filtering convention used elsewhere in this app (e.g. Daily Site List).
  fromDate = signal(this.firstDayOfMonth());
  toDate = signal(this.lastDayOfMonth());
  userCode = signal(0);
  action = signal('');
  searchText = signal('');

  actionOptions = [
    { value: '', label: 'All actions' },
    { value: 'A', label: 'Added' },
    { value: 'E', label: 'Edited' },
    { value: 'D', label: 'Deleted' }
  ];

  constructor(
    private service: AuditLogService,
    private settings: SettingsService
  ) {
    // settings.branchCode() starts at its 0 default until SettingsService.init() resolves -
    // calling load() straight from ngOnInit fired the very first request while it was still 0
    // ("all branches"), then every later load (e.g. clicking Search) ran with the real resolved
    // branch, silently narrowing the result set - looked like data had "gone missing" after
    // Search, when really the first load was the inconsistent one. Same fix pattern as Manpower
    // Schedule's list page: refresh once settings has actually loaded, not just once up front.
    effect(() => {
      if (this.settings.loaded()) { this.loadUsers(); this.load(); }
    }, { allowSignalWrites: true });
  }

  private loadUsers(): void {
    this.service.getUsers(this.settings.branchCode()).subscribe({ next: rows => this.users.set(rows ?? []), error: () => {} });
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.service.getList({
      branchCode: this.settings.branchCode(),
      fromDate: this.fromDate() || undefined,
      toDate: this.toDate() || undefined,
      userCode: this.userCode() || undefined,
      action: this.action() || undefined,
      search: this.searchText().trim() || undefined
    }).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load the audit log.'); this.loading.set(false); }
    });
  }

  actionLabel(code: string): string {
    return ACTION_LABELS[String(code ?? '').toUpperCase()] ?? code ?? '';
  }

  actionBadgeClass(code: string): string {
    const upper = String(code ?? '').toUpperCase();
    if (upper === 'A') return 'added';
    if (upper === 'D') return 'deleted';
    return 'edited';
  }

  private firstDayOfMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  private lastDayOfMonth(): string {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
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
