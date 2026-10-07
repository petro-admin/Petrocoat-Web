import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

// Independent, web-only Accounts module - not a port of the desktop's own "Stimes.Accounts.*"
// accounting system, and never reads/writes its 57-table schema (accountAccountHead etc.).
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.AccountHeadMaster';

interface GroupNode {
  key: string;
  label: string;
  rows: any[];
}

@Component({
  selector: 'app-account-head-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account-head-list.component.html',
  styleUrl: './account-head-list.component.scss'
})
export class AccountHeadListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);
  searchText = signal('');

  filteredRows = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(this.read(row, 'HeadName') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'GroupName') ?? '').toLowerCase().includes(term)
    );
  });

  // Grouped by Account Group (Tally-style: ledgers listed under their group) - same collapsible
  // pattern used for Branch/Sono grouping in Resource Return's own list.
  groups = computed<GroupNode[]>(() => {
    const map = new Map<string, any[]>();
    for (const row of this.filteredRows()) {
      const key = this.toText(this.read(row, 'GroupName')) || '(ungrouped)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries()).map(([key, groupRows]) => ({ key, label: key, rows: groupRows }));
  });

  collapsed = signal<Set<string>>(new Set());

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  toggle(key: string): void {
    const next = new Set(this.collapsed());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.collapsed.set(next);
  }

  isCollapsed(key: string): boolean {
    return this.collapsed().has(key);
  }

  constructor(
    private service: AccountService,
    private settings: SettingsService,
    private router: Router,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {
    // Settings (branchCode) load asynchronously right after login (see SettingsService.init(),
    // called once from erp-shell's constructor) - a plain refresh() in ngOnInit can fire before
    // that finishes and land on branchCode 0, leaving the list empty until a manual Refresh.
    // Reacting to the signal instead re-fetches automatically once the real branch is known, and
    // again whenever the user switches branch from the settings bar.
    effect(() => {
      if (this.settings.branchCode()) this.refresh();
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
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
    this.service.getHeads(this.settings.branchCode()).subscribe({
      next: rows => { this.rows.set(rows ?? []); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load Account Heads.'); this.loading.set(false); }
    });
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/accounts/account-head/0']);
  }

  open(row: any): void {
    this.router.navigate(['/accounts/account-head', this.read(row, 'Code')]);
  }

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();
    const code = this.toNumber(this.read(row, 'Code'));
    if (!code) return;

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete this Account Head ?'))) return;

    this.deleting.set(true);
    this.service.deleteHead(code).subscribe({
      next: (res: any) => {
        this.deleting.set(false);
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.refresh();
      },
      error: () => { this.deleting.set(false); this.errorMessage.set('Could not delete this Account Head.'); }
    });
  }

  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  toText(value: unknown): string {
    return value == null ? '' : String(value);
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
