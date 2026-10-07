import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Accounts.AccountHeadMaster';

@Component({
  selector: 'app-account-head-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './account-head-detail.component.html',
  styleUrl: './account-head-detail.component.scss'
})
export class AccountHeadDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  groups = signal<any[]>([]);

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
      headName: ['', Validators.required],
      groupCode: [null, Validators.required],
      openingBalance: [0],
      openingBalanceType: ['Dr'],
      remarks: [''],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.code === 0;
    this.loadRights();

    this.service.getGroups().subscribe({ next: rows => this.groups.set(rows ?? []), error: () => {} });

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
    this.service.getHeadById(this.code).subscribe({
      next: res => {
        this.form.patchValue({
          headName: this.read(res, 'HeadName') ?? '',
          groupCode: this.read(res, 'GroupCode'),
          openingBalance: this.read(res, 'OpeningBalance') ?? 0,
          openingBalanceType: this.read(res, 'OpeningBalanceType') ?? 'Dr',
          remarks: this.read(res, 'Remarks') ?? '',
          isActive: !!this.read(res, 'IsActive')
        });
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this Account Head.'); this.loading.set(false); }
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
      this.errorMessage.set('Please fill in Account Head Name and Group.');
      return;
    }

    const v = this.form.getRawValue();
    const payload = {
      code: this.code,
      headName: this.toText(v.headName),
      groupCode: this.toNumber(v.groupCode),
      branchCode: this.settings.branchCode(),
      openingBalance: this.toNumber(v.openingBalance),
      openingBalanceType: v.openingBalanceType,
      remarks: this.toText(v.remarks),
      isActive: !!v.isActive
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.saveHead(payload).subscribe({
      next: async () => {
        this.saving.set(false);
        await this.confirmDialog.notify('Account Head saved successfully.');
        this.router.navigate(['/accounts/account-head']);
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this Account Head.'); }
    });
  }

  cancel(): void {
    this.router.navigate(['/accounts/account-head']);
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
