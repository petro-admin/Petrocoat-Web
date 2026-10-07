import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DsrTimeSheetService } from '../services/dsr-time-sheet.service';
import { SettingsService } from '../../core/services/settings.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { UserRightsService, UserRights, NO_RIGHTS } from '../../core/services/user-rights.service';
import { ApprovalService } from '../../core/services/approval.service';

// Exact desktop class name (Payroll System, ModuleCode 360) - existing rights/approval
// configuration on the real desktop app applies unchanged through this string.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Payroll_System.DSRDailyTimeSheet';

interface DsrLine {
  slNo: number;
  employeeCode: number;
  empFullName: string;
  attStatusCode: number;
  actualHrs: number;
  basic: number;
  ot1: number;
  ot2: number;
  idle: number;
  category: string;
  multiActual: string;
  soCode: string;
  supervisorCode: string;
  supervisor: string;
  soNo: string;
  paid: number;
  isIdle: boolean;
}

interface JobSummaryRow {
  slNo: number;
  soNo: string;
  soCode: number;
  actualHrs: number;
  basic: number;
  ot: number;
  paid: number;
  idle: number;
}

@Component({
  selector: 'app-dsr-time-sheet-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './dsr-time-sheet-detail.component.html',
  styleUrl: './dsr-time-sheet-detail.component.scss'
})
export class DsrTimeSheetDetailComponent implements OnInit {
  form: FormGroup;
  isNew = true;
  code = 0;

  loading = signal(false);
  loadingAttendance = signal(false);
  saving = signal(false);
  errorMessage = signal<string | null>(null);

  lines = signal<DsrLine[]>([]);
  jobSummary = signal<JobSummaryRow[]>([]);
  attendanceStatuses = signal<any[]>([]);
  isHolidayDate = signal(false);

  // Filters on the DSR Time Sheet Details grid itself - Status and Employee - view-only, so
  // they narrow which rows the grouped grid below shows without touching the saved record or
  // the header's own Present/Absent/Idle summary (that stays the real whole-DSR count).
  filterStatus = signal<number | ''>('');
  filterEmployeeText = signal('');

  filteredLines = computed(() => {
    const status = this.filterStatus();
    const term = this.filterEmployeeText().trim().toLowerCase();
    return this.lines().filter(line =>
      (status === '' || line.attStatusCode === status) &&
      (!term || line.empFullName.toLowerCase().includes(term)));
  });

  clearLineFilters(): void {
    this.filterStatus.set('');
    this.filterEmployeeText.set('');
  }

  // Grouped by Category, same order the desktop's grid groups/sorts by.
  private readonly categoryOrder = ['PC Labour', 'PTS Labour', 'GRAVITAS Labour', 'PC Driver', 'PTS Driver', 'GRAVITAS Driver', 'SubContract'];
  groupedLines = computed(() => {
    const groups = new Map<string, DsrLine[]>();
    for (const line of this.filteredLines()) {
      const key = line.category || '(Uncategorized)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(line);
    }
    return Array.from(groups.entries())
      .sort((a, b) => this.categoryOrder.indexOf(a[0]) - this.categoryOrder.indexOf(b[0]))
      .map(([category, rows]) => ({ category, rows }));
  });

  totals = computed(() => {
    const rows = this.lines();
    const sum = (key: keyof DsrLine) => this.round2(rows.reduce((s, r) => s + this.toNumber(r[key]), 0));
    return {
      actualHrs: sum('actualHrs'), basic: sum('basic'), ot1: sum('ot1'), ot2: sum('ot2'), idle: sum('idle'), paid: sum('paid'),
      present: rows.filter(r => r.attStatusCode === 1).length,
      absent: rows.filter(r => r.attStatusCode === 2).length,
      idleCount: rows.filter(r => r.attStatusCode === 7).length
    };
  });

  rights = signal<UserRights>(NO_RIGHTS);
  rightsLoaded = signal(false);

  // ---------- Approval workflow (generic, shared - see StoreIndent's own detail component for
  // the pattern this mirrors exactly) ----------
  approvalEnabled = signal(false);
  approvalVisible = signal(false);
  approvalAction = signal<any>(null);
  approvalBusy = signal(false);
  approvalComment = signal('');
  approvalHistory = signal<any[][] | null>(null);
  moduleCode = 0;

  activeTab = signal<'entry' | 'approval'>('entry');

  // Per-category collapse, matching the desktop grid's own group expand/collapse - starts fully
  // expanded (desktop's default group state) rather than collapsed like Daily Site's list groups.
  private collapsedCategories = signal<Set<string>>(new Set());

  toggleCategory(category: string): void {
    const next = new Set(this.collapsedCategories());
    if (next.has(category)) next.delete(category); else next.add(category);
    this.collapsedCategories.set(next);
  }

  isCategoryCollapsed(category: string): boolean {
    return this.collapsedCategories().has(category);
  }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private service: DsrTimeSheetService,
    private settings: SettingsService,
    private confirmDialog: ConfirmDialogService,
    private userRightsService: UserRightsService,
    private approvalService: ApprovalService
  ) {
    this.form = this.fb.group({
      dsrNumber: [{ value: '', disabled: true }],
      dsrDate: ['', Validators.required],
      remarks: ['']
    });
  }

  ngOnInit(): void {
    this.code = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.isNew = this.code === 0;
    this.loadRights();
    this.loadApprovalSettings();
    this.service.getAttendanceStatuses().subscribe({ next: rows => this.attendanceStatuses.set(rows ?? []), error: () => {} });

    if (this.isNew) {
      this.form.patchValue({ dsrDate: this.today() });
      this.service.generateDocNo().subscribe({ next: res => this.form.patchValue({ dsrNumber: res?.dsrNumber ?? '' }) });
      this.checkHoliday();
    } else {
      this.loadExisting();
    }

    this.form.get('dsrDate')?.valueChanges.subscribe(() => { if (this.isNew) this.checkHoliday(); });
  }

  private loadRights(): void {
    this.userRightsService.getRights(FORM_CLASS_NAME).subscribe({
      next: rights => { this.rights.set(rights); this.rightsLoaded.set(true); },
      error: () => { this.rights.set(NO_RIGHTS); this.rightsLoaded.set(true); }
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
    this.approvalService.getStatus(this.moduleCode, this.code).subscribe({
      next: status => { this.approvalVisible.set(status.visible); this.approvalAction.set(status.action ?? null); },
      error: () => {}
    });
  }

  isApproved(): boolean {
    return this.read(this.approvalAction(), 'CurrentStatus') === 'A';
  }

  canSave(): boolean {
    return (this.isNew ? this.rights().add : this.rights().edit) && !this.isApproved();
  }

  private checkHoliday(): void {
    const date = this.form.get('dsrDate')?.value;
    if (!date) return;
    this.service.isHoliday(date, this.settings.branchCode()).subscribe({
      next: res => this.isHolidayDate.set(res.isHoliday),
      error: () => {}
    });
  }

  private loadExisting(): void {
    this.loading.set(true);
    this.service.getById(this.code).subscribe({
      next: res => {
        const header = this.read(res, 'Header') ?? res;
        this.form.patchValue({
          dsrNumber: this.read(header, 'DSRNumber') ?? '',
          dsrDate: this.toDateOnly(this.read(header, 'DSRDate')),
          remarks: this.read(header, 'Remarks') ?? ''
        });
        this.checkHoliday();

        const lineRows: any[] = this.read(res, 'Lines') ?? [];
        this.lines.set(lineRows.map(r => this.toLine(r)));

        const jobRows: any[] = this.read(res, 'JobSummary') ?? [];
        this.jobSummary.set(jobRows.map((r, i) => ({
          slNo: i + 1,
          soNo: this.toText(this.read(r, 'SoNo')),
          soCode: this.toNumber(this.read(r, 'SOCode')),
          actualHrs: this.toNumber(this.read(r, 'ActualHrs')),
          basic: this.toNumber(this.read(r, 'Basic')),
          ot: this.toNumber(this.read(r, 'OT')),
          paid: this.toNumber(this.read(r, 'Paid')),
          idle: this.toNumber(this.read(r, 'Idle'))
        })));

        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load this DSR Time Sheet.'); this.loading.set(false); }
    });
  }

  private toLine(r: any): DsrLine {
    const attStatusCode = this.toNumber(this.read(r, 'AttStatusCode'));
    return {
      slNo: this.toNumber(this.read(r, 'SlNo')),
      employeeCode: this.toNumber(this.read(r, 'EmployeeCode')),
      empFullName: this.toText(this.read(r, 'EmpFullName')),
      attStatusCode,
      actualHrs: this.toNumber(this.read(r, 'ActualHrs')),
      basic: this.toNumber(this.read(r, 'Basic')),
      ot1: this.toNumber(this.read(r, 'OT1')),
      ot2: this.toNumber(this.read(r, 'OT2')),
      idle: this.toNumber(this.read(r, 'IDLE', 'Idle')),
      category: this.toText(this.read(r, 'Category')),
      multiActual: this.toText(this.read(r, 'MultiActual')),
      soCode: this.toText(this.read(r, 'SOCode')),
      supervisorCode: this.toText(this.read(r, 'SupervisorCode')),
      supervisor: this.toText(this.read(r, 'Supervisor')),
      soNo: this.toText(this.read(r, 'SoNo')),
      paid: this.toNumber(this.read(r, 'Paid')),
      isIdle: attStatusCode === 7
    };
  }

  // ---------- Load from Daily Site ----------
  loadFromDailySite(): void {
    const date = this.form.get('dsrDate')?.value;
    if (!date) { this.errorMessage.set('Please pick the DSR Date first.'); return; }

    this.loadingAttendance.set(true);
    this.errorMessage.set(null);
    this.service.loadFromDailySite(date, this.settings.periodId(), this.settings.branchCode()).subscribe({
      next: rows => {
        this.lines.set((rows ?? []).map((r, i) => this.toLine({ ...r, SlNo: i + 1 })));
        this.recomputeJobSummary();
        this.loadingAttendance.set(false);
      },
      error: () => { this.errorMessage.set('Could not load attendance for this date.'); this.loadingAttendance.set(false); }
    });
  }

  // ---------- Row-level recalculation - exact port of the desktop's BTNUpdate_Click_1 logic
  // (DSRDailyTimeSheet.xaml.cs) - the canonical, complete calculation actually used before save.
  // Basic/OT1/OT2/Paid/Idle and AttStatusCode are all recomputed from ActualHrs + the Idle toggle. ----------
  toggleIdle(line: DsrLine): void {
    line.isIdle = !line.isIdle;
    this.recalculateLine(line);
  }

  private recalculateLine(line: DsrLine): void {
    const isHoliday = this.isHolidayDate();
    const applyCalc = (standardHours: number) => {
      let basic = line.basic === 0 ? standardHours : line.basic;
      const actualHrs = line.actualHrs;
      let ot1 = 0, ot2 = 0, idle = 0, paid = 0;

      if (actualHrs < basic) idle = basic - actualHrs;
      if (actualHrs > basic && !isHoliday) ot1 = actualHrs - basic;
      if (actualHrs > basic && isHoliday) ot2 = actualHrs - basic;
      if (actualHrs > 0) paid = basic + ot1;
      if (actualHrs > 0 && isHoliday) paid = actualHrs;
      if (line.isIdle) { ot1 = 0; ot2 = 0; paid = basic; idle = basic; }
      if (actualHrs <= 0 && !line.isIdle) { ot1 = 0; ot2 = 0; basic = 0; paid = 0; idle = 0; }

      line.basic = this.round2(basic);
      line.ot1 = this.round2(ot1);
      line.ot2 = this.round2(ot2);
      line.idle = this.round2(idle);
      line.paid = this.round2(paid);

      // AttStatusCode derivation - order matters, later assignment wins, same as desktop.
      let status = line.attStatusCode;
      if (isHoliday) status = 4;
      if (actualHrs === 0) status = 2;
      if (actualHrs > 0 && !isHoliday) status = 1;
      if (line.isIdle) status = 7;
      line.attStatusCode = status;

      this.lines.update(list => [...list]);
      this.recomputeJobSummary();
    };

    if (line.basic === 0) {
      this.service.getStandardHours(line.employeeCode, this.settings.branchCode(), line.category).subscribe({
        next: res => applyCalc(res.hours),
        error: () => applyCalc(8)
      });
    } else {
      applyCalc(line.basic);
    }
  }

  removeLine(line: DsrLine): void {
    this.lines.update(list => list.filter(l => l !== line));
    this.recomputeJobSummary();
  }

  // ---------- Job-wise Summary - exact port of the desktop's JobwiseSummary() method, including
  // its proportional-split behavior when an employee worked more than one job (SoNo) in the day. ----------
  private recomputeJobSummary(): void {
    const jobDict = new Map<string, JobSummaryRow>();

    for (const line of this.lines()) {
      const soNos = (line.soNo || '').split(',').map(s => s.trim()).filter(s => s !== '');
      const soCodes = (line.soCode || '').split(',').map(s => s.trim()).filter(s => s !== '');
      const hrs = (line.multiActual || '').split(',').map(s => s.trim()).filter(s => s !== '');
      const basic = line.basic, ot1 = line.ot1, ot2 = line.ot2, actualHrs = line.actualHrs, idle = line.idle;

      if (soNos.length === 0) continue;

      if (soNos.length === 1) {
        const key = soNos[0];
        const entry = jobDict.get(key) ?? { slNo: 0, soNo: key, soCode: this.toNumber(soCodes[0]), actualHrs: 0, basic: 0, ot: 0, paid: 0, idle: 0 };
        entry.actualHrs += actualHrs;
        entry.basic += basic;
        entry.ot += ot1 + ot2;
        entry.paid += basic + ot1 + ot2;
        entry.idle += idle;
        jobDict.set(key, entry);
      } else {
        let sumActual = 0, splitOT = 0, sumOT = 0;
        for (let i = 0; i < soNos.length; i++) {
          const key = soNos[i];
          if (!key) continue;
          const splitHrs = this.toNumber(hrs[i]);
          const splitBasic = this.round2(basic / soNos.length);
          sumActual += splitHrs;

          let splitIdle = 0;
          if (i === soNos.length - 1 && sumActual < basic) splitIdle = Math.max(basic - sumActual, 0);
          if (sumActual > basic) { splitOT = sumActual - basic - sumOT; sumOT += splitOT; }

          const entry = jobDict.get(key) ?? { slNo: 0, soNo: key, soCode: this.toNumber(soCodes[i]), actualHrs: 0, basic: 0, ot: 0, paid: 0, idle: 0 };
          entry.actualHrs += splitHrs;
          entry.basic += splitBasic;
          entry.ot += splitOT;
          entry.paid += splitBasic + splitOT;
          entry.idle += splitIdle;
          jobDict.set(key, entry);
        }
      }
    }

    const result = Array.from(jobDict.values()).sort((a, b) => a.soNo.localeCompare(b.soNo));
    result.forEach((r, i) => r.slNo = i + 1);
    this.jobSummary.set(result);
  }

  // ---------- Approval workflow actions (identical pattern to StoreIndentDetailComponent) ----------
  async toggleLock(): Promise<void> {
    if (this.isNew) return;
    const locked = this.read(this.approvalAction(), 'IsLocked') === 'L';
    const confirmMsg = locked ? 'Are you sure to Unlock this Time Sheet ?' : 'Are you sure to Lock this Time Sheet ?';
    if (!(await this.confirmDialog.confirm(confirmMsg))) return;

    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.code, 'L', locked ? 'U' : 'L', this.approvalComment()).subscribe({
      next: res => { this.approvalBusy.set(false); this.confirmDialog.notify(res?.result ?? ''); this.loadApprovalStatus(); },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not update lock status.'); }
    });
  }

  approve(): void { this.actOnApproval('A', 'Approved!!'); }
  deny(): void { this.actOnApproval('D', 'Denied!!'); }

  private actOnApproval(action: string, successMessage: string): void {
    if (this.isNew) return;
    this.approvalBusy.set(true);
    this.approvalService.manageAction(this.moduleCode, this.code, 'A', action, this.approvalComment()).subscribe({
      next: () => { this.approvalBusy.set(false); this.confirmDialog.notify(successMessage); this.loadApprovalStatus(); },
      error: () => { this.approvalBusy.set(false); this.errorMessage.set('Could not record the approval action.'); }
    });
  }

  loadApprovalHistory(): void {
    this.approvalService.getHistory(this.moduleCode, this.code).subscribe({
      next: tables => this.approvalHistory.set(tables ?? []),
      error: () => this.errorMessage.set('Could not load approval history.')
    });
  }

  updateApprovalComment(value: string): void {
    this.approvalComment.set(value);
  }

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  // ---------- Save / Delete ----------
  async save(): Promise<void> {
    if (!this.canSave()) {
      this.errorMessage.set(this.isApproved()
        ? 'This Time Sheet has been Approved and cannot be updated.'
        : `You do not have permission to ${this.isNew ? 'add' : 'edit'} this record.`);
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please enter the DSR Date.');
      return;
    }
    if (this.lines().length === 0) {
      this.errorMessage.set('Load attendance for this date before saving.');
      return;
    }

    if (!this.isNew) {
      this.approvalService.verify(FORM_CLASS_NAME, this.code).subscribe({
        next: async ({ count }) => {
          if (count > 0) {
            if (!(await this.confirmDialog.confirm("Some other users took action over this file.\nSo you can't delete or update before deleting that actions.\n\nDo you want to delete all actions over this file?"))) return;
            this.approvalService.clearActions(FORM_CLASS_NAME, this.code, this.moduleCode).subscribe({
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
    const v = this.form.getRawValue();
    const payload = {
      dsrCode: this.code,
      dsrNumber: this.toText(v.dsrNumber),
      dsrDate: v.dsrDate,
      remarks: this.toText(v.remarks),
      periodId: this.settings.periodId(),
      branchCode: this.settings.branchCode(),
      companyCode: this.settings.companyCode(),
      lines: this.lines().map(l => ({
        slNo: l.slNo,
        employeeCode: l.employeeCode,
        empFullName: l.empFullName,
        attStatusCode: l.attStatusCode,
        actualHrs: l.actualHrs,
        basic: l.basic,
        ot1: l.ot1,
        ot2: l.ot2,
        idle: l.idle,
        category: l.category,
        multiActual: l.multiActual,
        soCode: l.soCode,
        supervisorCode: l.supervisorCode,
        supervisor: l.supervisor,
        soNo: l.soNo,
        paid: l.paid
      })),
      jobSummary: this.jobSummary().map(j => ({
        slNo: j.slNo, soNo: j.soNo, soCode: j.soCode, actualHrs: j.actualHrs, basic: j.basic, ot: j.ot, paid: j.paid, idle: j.idle
      }))
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    this.service.save(payload).subscribe({
      next: async (res: any) => {
        this.saving.set(false);
        await this.confirmDialog.notify(res?.result || 'Saved Successfully');
        this.router.navigate(['/dsr-time-sheet']);
      },
      error: () => { this.saving.set(false); this.errorMessage.set('Could not save this DSR Time Sheet.'); }
    });
  }

  async deleteRecord(): Promise<void> {
    if (this.isNew || !this.rights().delete) return;
    if (!(await this.confirmDialog.confirm('Are you sure to delete this DSR Time Sheet ?'))) return;

    this.service.delete(this.code).subscribe({
      next: async (res: any) => {
        await this.confirmDialog.notify(res?.result || 'Deleted Successfully');
        this.router.navigate(['/dsr-time-sheet']);
      },
      error: () => this.errorMessage.set('Could not delete this DSR Time Sheet.')
    });
  }

  cancel(): void {
    this.router.navigate(['/dsr-time-sheet']);
  }

  print(): void {
    const a = document.createElement('a');
    a.href = `/dsr-time-sheet/${this.code}/print`;
    a.target = '_blank';
    a.click();
  }

  statusLabel(code: number): string {
    const match = this.attendanceStatuses().find(s => this.toNumber(this.read(s, 'AttStatusCode')) === code);
    return match ? this.read(match, 'AttStatusDesc') : String(code);
  }

  // Matches the desktop's own row background colors (2=Absent red, 4=Holiday yellow, 7=Idle blue,
  // 8=Vacation orange).
  rowClass(code: number): string {
    if (code === 2) return 'row-absent';
    if (code === 4) return 'row-holiday';
    if (code === 7) return 'row-idle';
    if (code === 8) return 'row-vacation';
    return 'row-present';
  }

  private today(): string {
    const processingDate = this.settings.processingDate() ?? new Date();
    return processingDate.toISOString().substring(0, 10);
  }

  private toDateOnly(value: unknown): string {
    if (!value) return '';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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
