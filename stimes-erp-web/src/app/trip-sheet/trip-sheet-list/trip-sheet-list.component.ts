import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TripSheetService } from '../services/trip-sheet.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

// Matches this.GetType().ToString() in the desktop app's convention - registered in
// AdminModuleInfo (ModuleCode 369) so an admin can tick which users see Trip Sheet at all,
// the same way VSR/Daily Site/Store Indent are gated.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Fleet_Management.TripSheet';

@Component({
  selector: 'app-trip-sheet-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trip-sheet-list.component.html',
  styleUrl: './trip-sheet-list.component.scss'
})
export class TripSheetListComponent implements OnInit {
  rows = signal<any[]>([]);
  loading = signal(false);
  deleting = signal(false);
  errorMessage = signal<string | null>(null);
  searchText = signal('');

  // Matches desktop's CheckPermission() - rights.access gates the whole page, add/delete gate
  // those specific buttons.
  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  filteredRows = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(this.read(row, 'DocNo') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'RegistrationNo') ?? '').toLowerCase().includes(term) ||
      String(this.read(row, 'DriverName') ?? '').toLowerCase().includes(term)
    );
  });

  constructor(
    private service: TripSheetService,
    private router: Router,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {}

  ngOnInit(): void {
    this.loadRights();
    this.refresh();
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
      error: () => { this.errorMessage.set('Could not load Trip Sheet records.'); this.loading.set(false); }
    });
  }

  openNew(): void {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    this.router.navigate(['/trip-sheet/0']);
  }

  openReport(): void {
    this.router.navigate(['/trip-sheet/report']);
  }

  open(row: any): void {
    this.router.navigate(['/trip-sheet', this.read(row, 'Code')]);
  }

  async deleteRow(row: any, event: Event): Promise<void> {
    event.stopPropagation();
    const code = this.toNumber(this.read(row, 'Code'));
    if (!code) return;

    if (!this.rights().delete) {
      this.errorMessage.set('You do not have permission to delete.');
      return;
    }

    if (!(await this.confirmDialog.confirm('Are you sure to delete this record ?'))) return;

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
