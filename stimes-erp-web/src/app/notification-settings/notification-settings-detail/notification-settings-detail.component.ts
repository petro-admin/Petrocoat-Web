import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NotificationSettingsService } from '../services/notification-settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { FilterSelectComponent } from '../../shared/filter-select/filter-select.component';
import { MultiSelectComponent } from '../../shared/multi-select/multi-select.component';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.SystemAdmin.NotificationSettings';

@Component({
  selector: 'app-notification-settings-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FilterSelectComponent, MultiSelectComponent],
  templateUrl: './notification-settings-detail.component.html',
  styleUrl: './notification-settings-detail.component.scss'
})
export class NotificationSettingsDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  systems = signal<any[]>([]);
  moduleTypes = signal<any[]>([]);
  // Forms scoped to the currently picked System + Module Type - matches the desktop's own
  // ApprovalSettings.xaml.cs FillForm(), which only queries usp_GetModuleInfo once both are set.
  forms = signal<any[]>([]);
  users = signal<any[]>([]);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: NotificationSettingsService,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService
  ) {
    this.form = this.fb.group({
      systemCode: [null, Validators.required],
      moduleTypeCode: [null, Validators.required],
      // Holds the picked Form row's ModuleCode - FormClassName/FormName are resolved from the
      // matching row in forms() when this changes (see onFormChanged), not typed/stored directly.
      formModuleCode: [null, Validators.required],
      onCreate: [false],
      onUpdate: [false],
      onDelete: [false],
      onApprove: [false],
      onDeny: [false],
      active: [true],
      userCodes: [[]]
    });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.isNew = this.code === 0;

    this.loadRights();
    this.loadUsers();
    this.service.getSystems().subscribe({
      next: rows => this.systems.set(rows ?? []),
      error: () => this.errorMessage.set('Could not load the System list.')
    });
    this.service.getModuleTypes().subscribe({
      next: rows => this.moduleTypes.set(rows ?? []),
      error: () => this.errorMessage.set('Could not load the Module Type list.')
    });

    if (!this.isNew) this.loadExisting();
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  private loadUsers(): void {
    this.service.getUsers().subscribe({
      next: rows => this.users.set(rows ?? []),
      error: () => this.errorMessage.set('Could not load the User list.')
    });
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getById(this.code).subscribe({
      next: res => {
        const hdr = res?.Header ?? res?.header ?? {};
        const systemCode = this.toNumber(this.read(hdr, 'SystemCode'));
        const moduleTypeCode = this.toNumber(this.read(hdr, 'ModuleTypeCode'));
        const moduleCode = this.toNumber(this.read(hdr, 'ModuleCode'));

        this.form.patchValue({
          systemCode,
          moduleTypeCode,
          onCreate: this.isOn(this.read(hdr, 'OnCreate')),
          onUpdate: this.isOn(this.read(hdr, 'OnUpdate')),
          onDelete: this.isOn(this.read(hdr, 'OnDelete')),
          onApprove: this.isOn(this.read(hdr, 'OnApprove')),
          onDeny: this.isOn(this.read(hdr, 'OnDeny')),
          active: this.read(hdr, 'Active') !== 'N',
          userCodes: (this.responseArray(res, 'UserCodes', 'userCodes')).map((r: any) => this.toNumber(this.read(r, 'UserCode')))
        });

        this.service.getForms(systemCode, moduleTypeCode).subscribe({
          next: rows => {
            this.forms.set(rows ?? []);
            this.form.patchValue({ formModuleCode: moduleCode });
            this.loading.set(false);
          },
          error: () => { this.errorMessage.set('Could not load the Form list.'); this.loading.set(false); }
        });
      },
      error: () => { this.errorMessage.set('Could not load the record.'); this.loading.set(false); }
    });
  }

  // System/Module Type changing resets the Form picker and reloads its options, same as
  // desktop's ddlSystem_SelectionChanged/ddlModule_SelectionChanged.
  onSystemOrModuleTypeChanged(): void {
    this.form.patchValue({ formModuleCode: null });
    this.forms.set([]);
    const systemCode = this.toNumber(this.form.get('systemCode')?.value);
    const moduleTypeCode = this.toNumber(this.form.get('moduleTypeCode')?.value);
    if (!systemCode || !moduleTypeCode) return;

    this.service.getForms(systemCode, moduleTypeCode).subscribe({
      next: rows => this.forms.set(rows ?? []),
      error: () => this.errorMessage.set('Could not load the Form list.')
    });
  }

  selectedForm(): any {
    const moduleCode = this.toNumber(this.form.get('formModuleCode')?.value);
    return this.forms().find(f => this.toNumber(this.read(f, 'ModuleCode')) === moduleCode) ?? null;
  }

  async save(): Promise<void> {
    if (!this.rights().add) {
      this.errorMessage.set('You do not have permission to add.');
      return;
    }
    if (this.form.invalid) {
      this.errorMessage.set('Please choose a System, Module Type and Form.');
      return;
    }
    const form = this.selectedForm();
    if (!form) {
      this.errorMessage.set('Please choose a Form.');
      return;
    }

    const v = this.form.getRawValue();
    const atLeastOneEvent = v.onCreate || v.onUpdate || v.onDelete || v.onApprove || v.onDeny;
    if (!atLeastOneEvent) {
      this.errorMessage.set('Please select at least one event to notify on.');
      return;
    }
    if (!v.userCodes || v.userCodes.length === 0) {
      this.errorMessage.set('Please choose at least one user to notify.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    this.service.save({
      code: this.code,
      formClassName: this.read(form, 'FormShortName'),
      formName: this.read(form, 'FormName'),
      systemCode: this.toNumber(v.systemCode),
      moduleTypeCode: this.toNumber(v.moduleTypeCode),
      moduleCode: this.toNumber(v.formModuleCode),
      onCreate: !!v.onCreate,
      onUpdate: !!v.onUpdate,
      onDelete: !!v.onDelete,
      onApprove: !!v.onApprove,
      onDeny: !!v.onDeny,
      active: !!v.active,
      userCodes: (v.userCodes ?? []).map((u: unknown) => this.toNumber(u))
    }).subscribe({
      next: res => {
        this.saving.set(false);
        if (res?.code) {
          this.confirmDialog.notify(res.result || 'Saved Successfully');
          this.router.navigate(['/notification-settings']);
        } else {
          this.errorMessage.set(res?.result || 'Save failed.');
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.message || 'Save failed. Check the API console for details.');
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/notification-settings']);
  }

  private isOn(value: unknown): boolean {
    return value === true || value === 1 || value === '1' || value === 'Y';
  }

  private responseArray(response: any, ...keys: string[]): any[] {
    for (const key of keys) {
      const value = this.read(response, key);
      if (Array.isArray(value)) return value;
    }
    return [];
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

  private toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
}
