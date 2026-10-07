import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccidentReportService } from '../services/accident-report.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

// Independent, web-only module - not a port of the desktop's own unbuilt "AccidentRegistration"
// module slot, so this class name is deliberately its own rather than matching that one.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.AccidentReporting';

@Component({
  selector: 'app-accident-report-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './accident-report-list.component.html',
  styleUrl: './accident-report-list.component.scss'
})
export class AccidentReportListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);
  searchText = signal('');
  statusFilter = signal('');

  filteredRows = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    const status = this.statusFilter();
    return this.rows().filter(row => {
      if (status && this.read(row, 'Status') !== status) return false;
      if (!term) return true;
      return String(this.read(row, 'DocNo') ?? '').toLowerCase().includes(term) ||
        String(this.read(row, 'DriverName') ?? '').toLowerCase().includes(term) ||
        String(this.read(row, 'RegistrationNo') ?? '').toLowerCase().includes(term);
    });
  });

  summary = computed(() => {
    const rows = this.rows();
    const count = (predicate: (row: any) => boolean) => rows.filter(predicate).length;
    return {
      open: count(r => this.read(r, 'Status') !== 'Closed'),
      review: count(r => this.read(r, 'Status') === 'Under Review'),
      severe: count(r => ['Injury', 'Fatal'].includes(this.read(r, 'Severity'))),
      closed: count(r => this.read(r, 'Status') === 'Closed')
    };
  });

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private service: AccidentReportService,
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
      error: () => { this.errorMessage.set('Could not load accident reports.'); this.loading.set(false); }
    });
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/accident-report/0']);
  }

  open(row: any): void {
    this.router.navigate(['/accident-report', this.read(row, 'Code')]);
  }

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();
    const code = this.toNumber(this.read(row, 'Code'));
    if (!code) return;

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete this accident report ?'))) return;

    this.deleting.set(true);
    this.service.delete(code).subscribe({
      next: (res: any) => {
        this.deleting.set(false);
        this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.refresh();
      },
      error: () => { this.deleting.set(false); this.errorMessage.set('Could not delete the record.'); }
    });
  }

  severityStyle(severity: string): { bg: string; fg: string } {
    const map: Record<string, { bg: string; fg: string }> = {
      Minor: { bg: '#fdf2e0', fg: '#96650c' },
      Major: { bg: '#fde4d1', fg: '#b3541e' },
      Injury: { bg: '#fde1e1', fg: '#b3261e' },
      Fatal: { bg: '#3a1414', fg: '#ffffff' }
    };
    return map[severity] ?? map['Minor'];
  }

  statusStyle(status: string): { bg: string; fg: string } {
    const map: Record<string, { bg: string; fg: string }> = {
      Submitted: { bg: '#e6ecfb', fg: '#3049a8' },
      'Under Review': { bg: '#fdf2e0', fg: '#96650c' },
      Closed: { bg: '#e5f6ea', fg: '#1a7a3d' }
    };
    return map[status] ?? map['Submitted'];
  }

  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
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
