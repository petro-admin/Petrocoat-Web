import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ManpowerScheduleService } from '../services/manpower-schedule.service';
import { SettingsService } from '../../core/services/settings.service';
import { ApprovalService } from '../../core/services/approval.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { DateInputComponent } from '../../shared/date-input/date-input.component';
import { FilterSelectComponent } from '../../shared/filter-select/filter-select.component';
import { exportGroupedSheetToExcel } from '../../shared/excel-export';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Production.ManpowerSchedule';

@Component({
  selector: 'app-manpower-schedule-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DateInputComponent, FilterSelectComponent],
  templateUrl: './manpower-schedule-detail.component.html',
  styleUrl: './manpower-schedule-detail.component.scss'
})
export class ManpowerScheduleDetailComponent implements OnInit {
  id = 0;
  isNew = true;
  loading = signal(false);
  saving = signal(false);
  busy = signal(false);
  errorMessage = signal<string | null>(null);

  jobs = signal<any[]>([]);
  customers = signal<any[]>([]);
  sources = signal<any[]>([]);
  shifts = signal<any[]>([]);
  employees = signal<any[]>([]);
  supervisors = signal<any[]>([]);
  drivers = signal<any[]>([]);
  vehicles = signal<any[]>([]);
  idleEmpStatuses = signal<any[]>([]);

  // Approval workflow (Lock/Approve/Deny) - same generic ApprovalService convention Store Indent uses.
  approvalEnabled = signal(false);
  moduleCode = 0;
  approvalVisible = signal(false);
  approvalAction = signal<any>(null);
  approvalHistory = signal<any[][] | null>(null);
  approvalComment = signal('');
  approvalBusy = signal(false);

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  // ---------- Add Employees picker ----------
  // Matches desktop's ManpowerSchedule_EmployeeList modal: Job/Client/Supervisor/Driver/Vehicle
  // are set once here and applied to every employee checked below, not edited per-row afterward.
  showEmployeePicker = signal(false);
  pickerJobCode: number | null = null;
  pickerSupervisorCode: number | null = null;
  pickerDriverCode: number | null = null;
  pickerVehicleCode: number | null = null;
  pickerCandidates = signal<any[]>([]);
  pickerChecked = signal<Set<number>>(new Set());
  pickerLoading = signal(false);
  pickerFilters = signal({ source: '', employeeName: '', designation: '' });

  pickerFilteredCandidates = computed(() => {
    const f = this.pickerFilters();
    return this.pickerCandidates().filter(c => {
      if (f.source && !String(this.read(c, 'SourceName') ?? '').toLowerCase().includes(f.source.toLowerCase())) return false;
      if (f.employeeName && !String(this.read(c, 'EmpFullName') ?? '').toLowerCase().includes(f.employeeName.toLowerCase())) return false;
      if (f.designation && !String(this.read(c, 'Designation') ?? '').toLowerCase().includes(f.designation.toLowerCase())) return false;
      return true;
    });
  });

  // ---------- Add Idle Employees picker ----------
  showIdlePicker = signal(false);
  idlePickerCandidates = signal<any[]>([]);
  idlePickerChecked = signal<Set<number>>(new Set());
  idlePickerLoading = signal(false);

  // ---------- SO Transfer ----------
  transferJobCode: number | null = null;

  form!: FormGroup;

  get lines(): FormArray { return this.form.get('lines') as FormArray; }
  get idleEmployees(): FormArray { return this.form.get('idleEmployees') as FormArray; }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: ManpowerScheduleService,
    private approvalService: ApprovalService,
    private userRightsService: UserRightsService,
    public settings: SettingsService,
    private confirmDialog: ConfirmDialogService
  ) {
    this.form = this.fb.group({
      docNo: [{ value: '', disabled: true }],
      docDate: ['', Validators.required],
      lines: this.fb.array([]),
      idleEmployees: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.isNew = this.id === 0;

    this.loadApprovalSettings();
    this.loadRights();
    this.loadLookups(() => {
      if (this.isNew) {
        const docDate = this.today();
        this.form.patchValue({ docDate });
        this.service.generateDocNo(docDate).subscribe(res => this.form.patchValue({ docNo: res.docNo }));
      } else {
        this.loadExisting();
      }
    });
  }

  private today(): string {
    const processingDate = this.settings.processingDate() ?? new Date();
    return processingDate.toISOString().substring(0, 10);
  }

  private loadLookups(callback?: () => void): void {
    this.service.getLookups().subscribe({
      next: (lookups) => {
        this.jobs.set(lookups.jobs ?? []);
        this.customers.set(lookups.customers ?? []);
        this.sources.set(lookups.sources ?? []);
        this.shifts.set(lookups.shifts ?? []);
        this.employees.set(lookups.employees ?? []);
        this.supervisors.set(lookups.supervisors ?? []);
        this.drivers.set(lookups.drivers ?? []);
        this.vehicles.set(lookups.vehicles ?? []);
        this.idleEmpStatuses.set(lookups.idleEmpStatuses ?? []);
        callback?.();
      },
      error: () => { this.errorMessage.set('Could not load dropdown data.'); callback?.(); }
    });
  }

  private loadApprovalSettings(): void {
    this.approvalService.getSettings(FORM_CLASS_NAME).subscribe({
      next: settings => {
        this.approvalEnabled.set(settings.isApproval);
        this.moduleCode = settings.moduleCode;
        if (settings.isApproval && !this.isNew) this.loadApprovalStatus();
      },
      error: () => {}
    });
  }

  private loadApprovalStatus(): void {
    this.approvalService.getStatus(this.moduleCode, this.id).subscribe({
      next: status => {
        this.approvalVisible.set(status.visible);
        this.approvalAction.set(status.action ?? null);
      },
      error: () => {}
    });
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
    });
  }

  isApproved(): boolean {
    return this.read(this.approvalAction(), 'CurrentStatus') === 'A';
  }

  canSave(): boolean {
    return this.rights().add && !this.isApproved();
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getById(this.id, this.settings.periodId()).subscribe({
      next: (res) => {
        const hdr = this.firstRecord(res, 'Header', 'header');
        this.form.patchValue({
          docNo: this.read(hdr, 'DocNo'),
          docDate: this.toDateInputValue(this.read(hdr, 'DocDate'))
        });

        this.lines.clear();
        this.responseArray(res, 'Lines', 'lines').forEach((r: any) => this.addLineRow(r));

        this.idleEmployees.clear();
        this.responseArray(res, 'IdleEmployees', 'idleEmployees').forEach((r: any) => this.addIdleRow(r));

        if (this.approvalEnabled()) this.loadApprovalStatus();
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load record.'); this.loading.set(false); }
    });
  }

  // ---------- Lines grid ----------
  addLineRow(data?: any): void {
    const jobCode = this.toNumber(this.read(data, 'JobCode')) || null;
    const description = this.toText(this.read(data, 'Description'));
    const group = this.fb.group({
      chkYesNo: [false],
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.lines)],
      jobCode: [{ value: jobCode, disabled: !!description }],
      jobNo: [this.toText(this.read(data, 'JobNo')) || this.resolveJobNo(jobCode)],
      customerCode: [this.toNumber(this.read(data, 'CustomerCode')) || null],
      employeeCode: [this.toNumber(this.read(data, 'EmployeeCode')) || null],
      empFullName: [this.toText(this.read(data, 'EmpFullName')) || this.resolveName(this.employees(), this.toNumber(this.read(data, 'EmployeeCode')), 'EmployeeCode', 'EmpFullName')],
      supervisorCode: [this.toNumber(this.read(data, 'SupervisorCode')) || null],
      material: [this.toText(this.read(data, 'Material'))],
      consumable: [this.toText(this.read(data, 'Consumable'))],
      machinery: [this.toText(this.read(data, 'Machinery'))],
      shiftCode: [this.toNumber(this.read(data, 'ShiftCode')) || 1],
      driverCode: [this.toNumber(this.read(data, 'DriverCode')) || null],
      remarks: [this.toText(this.read(data, 'Remarks'))],
      vehicleCode: [this.toNumber(this.read(data, 'VehicleCode')) || null],
      sourceCode: [this.toNumber(this.read(data, 'SourceCode')) || null],
      description: [{ value: description, disabled: !!jobCode }]
    });
    this.lines.push(group);
  }

  async removeLineRow(index: number): Promise<void> {
    if (!(await this.confirmDialog.confirm('Are you sure delete this item ?'))) return;
    this.lines.removeAt(index);
    this.renumberRows(this.lines);
  }

  onLineEmployeeChanged(index: number, employeeCode: number | null): void {
    const row = this.lines.at(index);
    // Client-side in-grid duplicate check - matches desktop's DataTable.Select guard in gvScheduleDtl.
    const duplicate = this.lines.controls.some((other, otherIndex) =>
      otherIndex !== index && this.toNumber(other.get('employeeCode')?.value) === employeeCode && employeeCode);
    if (duplicate) {
      this.errorMessage.set('This employee is already scheduled in this document.');
      row.patchValue({ employeeCode: null, empFullName: '' }, { emitEvent: false });
      return;
    }
    const emp = this.employees().find(e => this.toNumber(this.read(e, 'EmployeeCode')) === employeeCode);
    row.patchValue({ empFullName: emp ? this.read(emp, 'EmpFullName') : '' }, { emitEvent: false });
  }

  customerName(row: AbstractControl): string {
    return this.resolveName(this.customers(), this.toNumber(row.get('customerCode')?.value), 'CustomerCode', 'CustomerName');
  }

  // Plain method, not computed() - reads FormArray/FormControl values, which aren't signals, so
  // this has to re-run on every change-detection pass (same reasoning as Store Indent's
  // isProjectMode()/isInhouseSubType()). Matches desktop's grid grouping: rows are partitioned by
  // JobCode, each group headed by "{JobNo} - {ClientName}" (blank-Job/Description-only rows all
  // fall into one trailing group, same as usp_GetManpowerScheduleAllSelectedEmployeeList's
  // PARTITION BY JobCode treating JobCode=0 as its own partition).
  lineGroups(): { jobKey: string; label: string; rows: { control: AbstractControl; index: number }[] }[] {
    const groups: { jobKey: string; label: string; rows: { control: AbstractControl; index: number }[] }[] = [];
    const indexByKey = new Map<string, number>();

    this.lines.controls.forEach((control, index) => {
      if (!this.matchesLineFilters(control)) return;

      const jobCode = this.toNumber(control.get('jobCode')?.value);
      const key = jobCode ? String(jobCode) : '(none)';
      if (!indexByKey.has(key)) {
        const label = jobCode
          ? `${this.toText(control.get('jobNo')?.value)} - ${this.customerName(control)}`
          : 'No Job (Description only)';
        indexByKey.set(key, groups.length);
        groups.push({ jobKey: key, label, rows: [] });
      }
      groups[indexByKey.get(key)!].rows.push({ control, index });
    });

    // usp_GetManpowerScheduleDtl/AllSelectedEmployeeList don't guarantee SlNo-ascending order
    // within a job (the latter orders by ROW_NUMBER() OVER(... ORDER BY (SELECT 1)), i.e. no real
    // order) - sort each group explicitly so SlNo always reads 1, 2, 3... top to bottom.
    for (const group of groups) {
      group.rows.sort((a, b) => this.toNumber(a.control.get('slNo')?.value) - this.toNumber(b.control.get('slNo')?.value));
    }

    return groups;
  }

  // Matches usp_GetManpowerScheduleReport's own DENSE_RANK() OVER (ORDER BY JobCode) as SlNo -
  // the PRINTED Sl No is a per-job rank (1, 2, 3... one per job), not the per-line Sl No the
  // on-screen grid shows. SONo/Driver/Vehicle/Client are shown once per job on the real RDLC
  // report (merged/spanned across every employee row in that job) - taken from the group's first
  // line, since in practice one vehicle/driver serves one job's whole crew. SONo itself is the
  // raw Sales Order number (resolved from the jobs() lookup, which stores it unconcatenated),
  // not the "SONo - ClientName" combined text the on-screen group header shows.
  printGroups(): {
    slNo: number; soNo: string; driverName: string; vehicleNo: string; clientName: string;
    employees: { employeeName: string; supervisor: string; material: string; consumable: string; machinery: string; shift: string; remarks: string }[];
  }[] {
    return this.lineGroups().map((group, index) => {
      const first = group.rows[0]?.control;
      const jobCode = first ? this.toNumber(first.get('jobCode')?.value) : 0;
      const job = this.jobs().find(j => this.toNumber(this.read(j, 'JobCode')) === jobCode);
      return {
        slNo: index + 1,
        soNo: job ? this.toText(this.read(job, 'JobNo')) : (first ? this.toText(first.get('jobNo')?.value) : ''),
        driverName: first ? this.resolveName(this.drivers(), this.toNumber(first.get('driverCode')?.value), 'EmployeeCode', 'EmpFullName') : '',
        vehicleNo: first ? this.resolveName(this.vehicles(), this.toNumber(first.get('vehicleCode')?.value), 'VehicleCode', 'RegistrationNo') : '',
        clientName: first ? this.customerName(first) : '',
        employees: group.rows.map(item => ({
          employeeName: this.toText(item.control.get('empFullName')?.value),
          supervisor: this.resolveName(this.supervisors(), this.toNumber(item.control.get('supervisorCode')?.value), 'EmployeeCode', 'EmpFullName'),
          material: this.toText(item.control.get('material')?.value),
          consumable: this.toText(item.control.get('consumable')?.value),
          machinery: this.toText(item.control.get('machinery')?.value),
          shift: this.resolveName(this.shifts(), this.toNumber(item.control.get('shiftCode')?.value), 'ShiftCode', 'ShiftName'),
          remarks: this.toText(item.control.get('remarks')?.value)
        }))
      };
    });
  }

  // Per-column filter text for the Schedule grid, matching the desktop grid's own per-column
  // filter row (job/driver/vehicle/client/source/employee/supervisor/material/.../remarks).
  lineFilters = signal({
    jobNo: '', driverName: '', vehicle: '', description: '', clientName: '', source: '',
    employeeName: '', supervisor: '', material: '', consumable: '', machinery: '', remarks: ''
  });

  updateLineFilter(field: keyof ReturnType<typeof this.lineFilters>, value: string): void {
    this.lineFilters.set({ ...this.lineFilters(), [field]: value });
  }

  private matchesLineFilters(control: AbstractControl): boolean {
    const f = this.lineFilters();
    const contains = (value: unknown, term: string) =>
      !term || String(value ?? '').toLowerCase().includes(term.toLowerCase());

    return contains(control.get('jobNo')?.value, f.jobNo)
      && contains(this.resolveName(this.drivers(), this.toNumber(control.get('driverCode')?.value), 'EmployeeCode', 'EmpFullName'), f.driverName)
      && contains(this.resolveName(this.vehicles(), this.toNumber(control.get('vehicleCode')?.value), 'VehicleCode', 'RegistrationNo'), f.vehicle)
      && contains(control.get('description')?.value, f.description)
      && contains(this.customerName(control), f.clientName)
      && contains(this.resolveName(this.sources(), this.toNumber(control.get('sourceCode')?.value), 'SourceCode', 'SourceName'), f.source)
      && contains(control.get('empFullName')?.value, f.employeeName)
      && contains(this.resolveName(this.supervisors(), this.toNumber(control.get('supervisorCode')?.value), 'EmployeeCode', 'EmpFullName'), f.supervisor)
      && contains(control.get('material')?.value, f.material)
      && contains(control.get('consumable')?.value, f.consumable)
      && contains(control.get('machinery')?.value, f.machinery)
      && contains(control.get('remarks')?.value, f.remarks);
  }

  distinctJobCount(): number {
    const codes = new Set(this.lines.controls.map(row => this.toNumber(row.get('jobCode')?.value)).filter(code => code > 0));
    return codes.size;
  }

  private resolveJobNo(jobCode: number | null): string {
    if (!jobCode) return '';
    const job = this.jobs().find(j => this.toNumber(this.read(j, 'JobCode')) === jobCode);
    return job ? this.toText(this.read(job, 'JobNo')) : '';
  }

  // ---------- Add Employees picker ----------
  openEmployeePicker(): void {
    this.pickerJobCode = null;
    this.pickerSupervisorCode = null;
    this.pickerDriverCode = null;
    this.pickerVehicleCode = null;
    this.pickerFilters.set({ source: '', employeeName: '', designation: '' });
    this.showEmployeePicker.set(true);
    this.refreshEmployeePicker();
  }

  onPickerJobChanged(jobCode: number | null): void {
    this.pickerJobCode = jobCode;
    this.refreshEmployeePicker();
  }

  pickerClientName(): string {
    const job = this.jobs().find(j => this.toNumber(this.read(j, 'JobCode')) === this.pickerJobCode);
    if (!job) return '';
    return this.resolveName(this.customers(), this.toNumber(this.read(job, 'CustomerCode')), 'CustomerCode', 'CustomerName');
  }

  updatePickerFilter(field: keyof ReturnType<typeof this.pickerFilters>, value: string): void {
    this.pickerFilters.set({ ...this.pickerFilters(), [field]: value });
  }

  private refreshEmployeePicker(): void {
    this.pickerLoading.set(true);
    this.pickerChecked.set(new Set());
    this.service.getEmployeePickerList(this.id, this.form.get('docDate')?.value, this.currentLinesAsDtlNew()).subscribe({
      next: rows => { this.pickerCandidates.set(rows ?? []); this.pickerLoading.set(false); },
      error: () => { this.pickerCandidates.set([]); this.pickerLoading.set(false); this.errorMessage.set('Could not load employee list.'); }
    });
  }

  // usp_GetManpowerScheduleEmployeeListExistingEmployeeChecking returns EmployeeCode as
  // varchar(max) (Convert(varchar(max), EmployeeCode)), not int - normalize to a real number here
  // so Set membership checks against numeric EmployeeCode values (e.g. in addSelectedEmployees)
  // actually match, instead of a string "93" silently never equaling the number 93.
  togglePickerChecked(employeeCode: number): void {
    const code = this.toNumber(employeeCode);
    const next = new Set(this.pickerChecked());
    if (next.has(code)) next.delete(code); else next.add(code);
    this.pickerChecked.set(next);
  }

  closeEmployeePicker(): void {
    this.showEmployeePicker.set(false);
  }

  addSelectedEmployees(): void {
    if (!this.pickerJobCode) { this.errorMessage.set('Choose a Job first.'); return; }
    const checked = this.pickerChecked();
    const candidates = this.pickerCandidates().filter(c => checked.has(this.toNumber(this.read(c, 'EmployeeCode'))));
    if (candidates.length === 0) { this.closeEmployeePicker(); return; }

    const docDate = this.form.get('docDate')?.value;
    this.busy.set(true);
    // Re-check each candidate right before merging (matches desktop re-running the existing-
    // employee check at Add time, silently skipping anyone already scheduled elsewhere that date).
    forkJoin(candidates.map(c => this.service.checkExistingEmployee(this.id, docDate, this.toNumber(this.read(c, 'EmployeeCode'))))).subscribe({
      next: results => {
        const job = this.jobs().find(j => this.toNumber(this.read(j, 'JobCode')) === this.pickerJobCode);
        candidates.forEach((c, i) => {
          if (results[i]?.alreadyScheduled) return;
          this.addLineRow({
            JobCode: this.pickerJobCode,
            JobNo: job ? this.read(job, 'JobNo') : '',
            CustomerCode: job ? this.read(job, 'CustomerCode') : null,
            EmployeeCode: this.read(c, 'EmployeeCode'),
            EmpFullName: this.read(c, 'EmpFullName'),
            SourceCode: this.read(c, 'SourceCode'),
            SupervisorCode: this.pickerSupervisorCode,
            DriverCode: this.pickerDriverCode,
            VehicleCode: this.pickerVehicleCode,
            ShiftCode: 1
          });
        });
        this.normalizeLines();
        this.busy.set(false);
        this.closeEmployeePicker();
      },
      error: () => { this.busy.set(false); this.errorMessage.set('Could not verify employee availability.'); }
    });
  }

  // Re-numbers SlNo per Job group and re-decorates JobNo/CustomerName - matches
  // usp_GetManpowerScheduleAllSelectedEmployeeList, run after merging picked employees or an SO Transfer.
  private normalizeLines(): void {
    this.service.getAllSelectedEmployeeList(this.currentLinesAsDtlNew()).subscribe({
      next: rows => {
        this.lines.clear();
        (rows ?? []).forEach(r => this.addLineRow(r));
      },
      error: () => this.errorMessage.set('Could not refresh the schedule list.')
    });
  }

  private currentLinesAsDtlNew(): any[] {
    return this.lines.getRawValue().map((row: any) => ({
      chkYesNo: !!row.chkYesNo,
      slNo: this.toNumber(row.slNo),
      jobCode: this.toNumber(row.jobCode),
      customerCode: this.toNumber(row.customerCode),
      employeeCode: this.toNumber(row.employeeCode),
      supervisorCode: this.toNumber(row.supervisorCode),
      material: this.toText(row.material),
      consumable: this.toText(row.consumable),
      machinery: this.toText(row.machinery),
      shiftCode: this.toNumber(row.shiftCode),
      driverCode: this.toNumber(row.driverCode),
      remarks: this.toText(row.remarks),
      vehicleCode: this.toNumber(row.vehicleCode),
      sourceCode: this.toNumber(row.sourceCode),
      description: this.toText(row.description),
      jobNo: this.toText(row.jobNo),
      empFullName: this.toText(row.empFullName)
    }));
  }

  // ---------- SO Transfer ----------
  // Bulk-reassigns every checkbox-selected row to a different Job - copies Supervisor/Shift/
  // Driver/Vehicle/Source from an existing row already under that Job, or the grid's first row
  // if none exists yet, matching desktop's SO Transfer behaviour.
  transferSelected(): void {
    if (!this.transferJobCode) { this.errorMessage.set('Choose a Job to transfer to.'); return; }
    const targetJobCode = this.transferJobCode;
    const checkedRows = this.lines.controls.filter(row => row.get('chkYesNo')?.value);
    if (checkedRows.length === 0) { this.errorMessage.set('Select at least one row to transfer.'); return; }

    const job = this.jobs().find(j => this.toNumber(this.read(j, 'JobCode')) === targetJobCode);
    const referenceRow = this.lines.controls.find(row => this.toNumber(row.get('jobCode')?.value) === targetJobCode && !row.get('chkYesNo')?.value)
      ?? this.lines.at(0);

    checkedRows.forEach(row => {
      row.patchValue({
        chkYesNo: false,
        jobCode: targetJobCode,
        jobNo: job ? this.read(job, 'JobNo') : '',
        customerCode: job ? this.toNumber(this.read(job, 'CustomerCode')) : null,
        description: '',
        supervisorCode: referenceRow?.get('supervisorCode')?.value ?? null,
        shiftCode: referenceRow?.get('shiftCode')?.value ?? 1,
        driverCode: referenceRow?.get('driverCode')?.value ?? null,
        vehicleCode: referenceRow?.get('vehicleCode')?.value ?? null,
        sourceCode: referenceRow?.get('sourceCode')?.value ?? null
      }, { emitEvent: false });
      row.get('jobCode')?.enable({ emitEvent: false });
      row.get('description')?.disable({ emitEvent: false });
    });

    this.transferJobCode = null;
    this.normalizeLines();
  }

  anyLinesChecked(): boolean {
    return this.lines.controls.some(row => row.get('chkYesNo')?.value);
  }

  // ---------- Copy ----------
  // Matches desktop's Copy button: resets Code/Mode so the next Save creates a brand new
  // document, regenerates DocNo, but keeps every line/idle-employee row already loaded.
  copyAsNew(): void {
    this.id = 0;
    this.isNew = true;
    this.service.generateDocNo(this.form.get('docDate')?.value).subscribe(res => this.form.patchValue({ docNo: res.docNo }));
    this.confirmDialog.notify('Ready to save as a new document - Doc No has been regenerated.');
  }

  // Matches desktop's PrintButton_Click_1 / ReportManpowerSchedule.rdlc - same header+lines+idle
  // employees data (confirmed against usp_GetManpowerScheduleReport/usp_ManpowerScheduleIdleEmpDtlReport),
  // already all present on this same page, so printing it directly (same window.print() + @media
  // print convention as the other reports) instead of building a separate print-only route.
  print(): void {
    window.print();
  }

  exporting = signal(false);

  // Matches the real desktop RDLC report (ReportManpowerSchedule.rdlc, confirmed via
  // usp_GetManpowerScheduleReport) exactly: title block, Branch/DocNo/Date header, then a table
  // grouped by job with Sl No/SONo/Driver Name/Vehicle No/Client Name merged down the full height
  // of their job group, Employee Name/Supervisor/Material/Consumable/Machinery/Shift/Remarks one
  // row per employee. No Source/Description columns - the real report doesn't show them either.
  async exportToExcel(): Promise<void> {
    this.exporting.set(true);
    try {
      const groupColumns = [
        { header: 'Sl No', key: 'slNo', width: 8 },
        { header: 'SONo', key: 'soNo', width: 32 },
        { header: 'Driver Name', key: 'driverName', width: 22 },
        { header: 'Vehicle No', key: 'vehicleNo', width: 16 },
        { header: 'Client Name', key: 'clientName', width: 30 }
      ];
      const detailColumns = [
        { header: 'Employee Name', key: 'employeeName', width: 24 },
        { header: 'Supervisor', key: 'supervisor', width: 24 },
        { header: 'Material', key: 'material', width: 18 },
        { header: 'Consumable', key: 'consumable', width: 18 },
        { header: 'Machinery', key: 'machinery', width: 18 },
        { header: 'Shift', key: 'shift', width: 10 },
        { header: 'Remarks', key: 'remarks', width: 24 }
      ];
      const groups = this.printGroups().map(g => ({
        groupValues: { slNo: g.slNo, soNo: g.soNo, driverName: g.driverName, vehicleNo: g.vehicleNo, clientName: g.clientName },
        details: g.employees
      }));

      const idleColumns = [
        { header: 'Sl', key: 'sl', width: 8 },
        { header: 'Employee', key: 'employeeName', width: 28 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Remarks', key: 'remarks', width: 30 }
      ];
      const idleRows = this.idleEmployees.getRawValue().map((row: any) => ({
        sl: row.slNo,
        employeeName: this.resolveName(this.employees(), this.toNumber(row.employeeCode), 'EmployeeCode', 'EmpFullName'),
        status: this.resolveName(this.idleEmpStatuses(), this.toNumber(row.statusCode), 'StatusCode', 'Status'),
        remarks: row.remarks || ''
      }));

      const docNo = this.toText(this.form.get('docNo')?.value) || 'ManpowerSchedule';
      await exportGroupedSheetToExcel(docNo, 'Manpower Schedule', groupColumns, detailColumns, groups, {
        title: 'MANPOWER SCHEDULE',
        infoRows: [
          [{ label: 'Branch :', value: this.settings.branchName() }],
          [{ label: 'Doc No :', value: docNo }, { label: 'Date :', value: this.form.get('docDate')?.value || '' }]
        ]
      }, [{ name: 'Idle Employees', columns: idleColumns, rows: idleRows }]);
    } finally {
      this.exporting.set(false);
    }
  }

  // ---------- Idle Employees grid ----------
  addIdleRow(data?: any): void {
    this.idleEmployees.push(this.fb.group({
      slNo: [this.read(data, 'SlNo') ?? this.nextSlNo(this.idleEmployees)],
      employeeCode: [this.toNumber(this.read(data, 'EmployeeCode')) || null],
      empFullName: [this.resolveName(this.employees(), this.toNumber(this.read(data, 'EmployeeCode')), 'EmployeeCode', 'EmpFullName')],
      statusCode: [this.toNumber(this.read(data, 'StatusCode')) || 1],
      remarks: [this.toText(this.read(data, 'Remarks'))]
    }));
  }

  async removeIdleRow(index: number): Promise<void> {
    if (!(await this.confirmDialog.confirm('Are you sure delete this item ?'))) return;
    this.idleEmployees.removeAt(index);
    this.renumberRows(this.idleEmployees);
  }

  onIdleEmployeeChanged(index: number, employeeCode: number | null): void {
    const row = this.idleEmployees.at(index);
    const emp = this.employees().find(e => this.toNumber(this.read(e, 'EmployeeCode')) === employeeCode);
    row.patchValue({ empFullName: emp ? this.read(emp, 'EmpFullName') : '' }, { emitEvent: false });
  }

  openIdlePicker(): void {
    this.showIdlePicker.set(true);
    this.idlePickerLoading.set(true);
    this.idlePickerChecked.set(new Set());
    this.service.getIdleEmployeeChecking(this.id, this.form.get('docDate')?.value, this.currentLinesAsDtlNew()).subscribe({
      next: rows => { this.idlePickerCandidates.set(rows ?? []); this.idlePickerLoading.set(false); },
      error: () => { this.idlePickerCandidates.set([]); this.idlePickerLoading.set(false); this.errorMessage.set('Could not load idle employee list.'); }
    });
  }

  // Same varchar(max) EmployeeCode cast issue as the main picker - normalize to a number.
  toggleIdlePickerChecked(employeeCode: number): void {
    const code = this.toNumber(employeeCode);
    const next = new Set(this.idlePickerChecked());
    if (next.has(code)) next.delete(code); else next.add(code);
    this.idlePickerChecked.set(next);
  }

  closeIdlePicker(): void {
    this.showIdlePicker.set(false);
  }

  addSelectedIdleEmployees(): void {
    const checked = this.idlePickerChecked();
    const candidates = this.idlePickerCandidates().filter(c => checked.has(this.toNumber(this.read(c, 'EmployeeCode'))));
    candidates.forEach(c => this.addIdleRow({
      EmployeeCode: this.read(c, 'EmployeeCode'),
      StatusCode: this.toNumber(this.read(c, 'StatusCode')) || 1
    }));
    this.closeIdlePicker();
  }

  // ---------- Approval workflow ----------
  async toggleLock(): Promise<void> {
    if (this.isNew) return;
    const locked = this.read(this.approvalAction(), 'IsLocked') === 'L';
    const confirmMsg = locked ? 'Are you sure to Unlock this document ?' : 'Are you sure to Lock this document ?';
    if (!(await this.confirmDialog.confirm(confirmMsg))) return;

    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.id, 'L', locked ? 'U' : 'L', this.approvalComment()).subscribe({
      next: (res) => { this.approvalBusy.set(false); this.confirmDialog.notify(res?.result ?? ''); this.loadApprovalStatus(); },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not update lock status.'); }
    });
  }

  approve(): void { this.actOnApproval('A', 'Approved!!'); }
  deny(): void { this.actOnApproval('D', 'Denied!!'); }

  private actOnApproval(action: string, successMessage: string): void {
    if (this.isNew) return;
    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.id, 'A', action, this.approvalComment()).subscribe({
      next: () => { this.approvalBusy.set(false); this.confirmDialog.notify(successMessage); this.loadApprovalStatus(); },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not record the approval action.'); }
    });
  }

  loadApprovalHistory(): void {
    this.approvalService.getHistory(this.moduleCode, this.id).subscribe({
      next: tables => this.approvalHistory.set(tables ?? []),
      error: () => this.errorMessage.set('Could not load approval history.')
    });
  }

  updateApprovalComment(value: string): void {
    this.approvalComment.set(value);
  }

  // ---------- Save / Delete ----------
  async save(): Promise<void> {
    if (!this.rights().add) { this.errorMessage.set('You do not have permission to add.'); return; }
    if (this.isApproved()) { this.errorMessage.set('This document has been Approved and cannot be updated.'); return; }
    if (this.form.get('docDate')?.invalid) { this.form.markAllAsTouched(); return; }

    if (!this.isNew) {
      this.approvalService.verify(FORM_CLASS_NAME, this.id).subscribe({
        next: async ({ count }) => {
          if (count > 0) {
            if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
            this.approvalService.clearActions(FORM_CLASS_NAME, this.id, this.moduleCode).subscribe({
              next: () => this.doSave(),
              error: () => this.errorMessage.set('Transaction Failed...')
            });
          } else {
            this.doSave();
          }
        },
        error: () => this.doSave()
      });
    } else {
      this.doSave();
    }
  }

  private doSave(): void {
    this.saving.set(true);
    this.errorMessage.set(null);
    const wasNew = this.isNew;
    const v = this.form.getRawValue();

    const payload = {
      code: this.id,
      docNo: this.toText(v.docNo),
      docDate: v.docDate,
      mode: wasNew ? 0 : 1,
      lines: this.lines.getRawValue().map((row: any) => ({
        chkYesNo: !!row.chkYesNo,
        slNo: this.toNumber(row.slNo),
        jobCode: this.toNumber(row.jobCode),
        customerCode: this.toNumber(row.customerCode),
        employeeCode: this.toNumber(row.employeeCode),
        supervisorCode: this.toNumber(row.supervisorCode),
        material: this.toText(row.material),
        consumable: this.toText(row.consumable),
        machinery: this.toText(row.machinery),
        shiftCode: this.toNumber(row.shiftCode),
        driverCode: this.toNumber(row.driverCode),
        remarks: this.toText(row.remarks),
        vehicleCode: this.toNumber(row.vehicleCode),
        sourceCode: this.toNumber(row.sourceCode),
        description: this.toText(row.description)
      })),
      idleEmployees: this.idleEmployees.getRawValue().map((row: any) => ({
        slNo: this.toNumber(row.slNo),
        employeeCode: this.toNumber(row.employeeCode),
        statusCode: this.toNumber(row.statusCode),
        remarks: this.toText(row.remarks)
      }))
    };

    this.service.save(payload, this.settings.branchCode(), this.settings.periodId()).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.confirmDialog.notify(res?.result || (wasNew ? 'Saved Successfully' : 'Updated Successfully'));
        this.router.navigate(['/manpower-schedule']);
      },
      error: (err) => { this.saving.set(false); this.errorMessage.set(this.readSaveError(err)); }
    });
  }

  cancel(): void {
    this.router.navigate(['/manpower-schedule']);
  }

  // ---------- Helpers ----------
  private readSaveError(err: any): string {
    const errors = err?.error?.errors;
    if (errors && typeof errors === 'object') {
      const messages = Object.values(errors).flat().filter(Boolean);
      if (messages.length) return messages.join(' ');
    }
    return err?.error?.message || err?.error?.title || 'Save failed. Check the API console for details.';
  }

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  rowValue(record: any, key: string): any {
    return this.read(record, key);
  }

  read(record: any, ...keys: string[]): any {
    for (const key of keys) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (record?.[key] !== undefined) return record[key];
      if (record?.[camelKey] !== undefined) return record[camelKey];
    }
    return undefined;
  }

  private firstRecord(response: any, ...keys: string[]): any {
    for (const key of keys) {
      const value = this.read(response, key);
      if (Array.isArray(value) && value.length > 0) return value[0];
    }
    return {};
  }

  private responseArray(response: any, ...keys: string[]): any[] {
    for (const key of keys) {
      const value = this.read(response, key);
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  private resolveName(items: any[], code: number | null, codeKey: string, nameKey: string): string {
    if (!code) return '';
    const match = items.find(entry => this.toNumber(this.read(entry, codeKey)) === code);
    return match ? this.toText(this.read(match, nameKey)) : '';
  }

  private toDateInputValue(value: unknown): string {
    if (!value) return '';
    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
    return match?.[0] ?? '';
  }

  private nextSlNo(rows: FormArray): number {
    return rows.controls.reduce((max, row) => Math.max(max, this.toNumber(row.get('slNo')?.value)), 0) + 1;
  }

  private renumberRows(rows: FormArray): void {
    rows.controls.forEach((row, index) => row.get('slNo')?.setValue(index + 1, { emitEvent: false }));
  }

  // Not private - the picker modals' [checked] bindings call this directly from the template to
  // normalize EmployeeCode (returned as varchar(max) by usp_GetManpowerScheduleEmployeeList...)
  // to the same number type the pickerChecked/idlePickerChecked Sets store.
  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private toText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }
}
