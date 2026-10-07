import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.CostCenterMaster';

@Component({
  selector: 'app-cost-center-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './cost-center-detail.component.html',
  styleUrl: './cost-center-detail.component.scss'
})
export class CostCenterDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: AccountService,
    private settings: SettingsService,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {
    this.form = this.fb.group({
      costCenterName: ['', Validators.required],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.code === 0;
    this.loadRights();
    if (!this.isNew) this.loadExisting();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getCostCenterById(this.code).subscribe({
      next: res => {
        this.form.patchValue({
          costCenterName: this.read(res, 'CostCenterName') ?? '',
          isActive: !!this.read(res, 'IsActive')
        });
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this Cost Center.'); this.loading.set(false); }
    });
  }

  save(): void {
    const allowed = this.isNew ? this.rights().add : this.rights().edit;
    if (!allowed) {
      this.errorMessage.set(`You do not have permission to ${this.isNew ? 'add' : 'edit'} this record.`);
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please enter the Cost Center Name.');
      return;
    }

    const v = this.form.getRawValue();
    const payload = {
      code: this.code,
      costCenterName: this.toText(v.costCenterName),
      branchCode: this.settings.branchCode(),
      isActive: !!v.isActive
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.saveCostCenter(payload).subscribe({
      next: async () => {
        this.saving.set(false);
        await this.confirmDialog.notify('Cost Center saved successfully.');
        this.router.navigate(['/accounts/cost-center']);
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this Cost Center.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/accounts/cost-center']);
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
