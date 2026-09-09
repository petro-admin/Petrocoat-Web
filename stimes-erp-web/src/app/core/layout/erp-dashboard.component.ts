import { Component, ElementRef, HostListener, OnInit, ViewChild, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { DashboardBranch, DashboardDepartment, DashboardKpis, DashboardService } from '../services/dashboard.service';
import { AuthService } from '../services/auth.service';

const ADMIN_USER_CATEGORY_CODE = 1;
const RETROSYS_BRANCH_CODE = 6;

Chart.register(...registerables);

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-erp-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './erp-dashboard.component.html',
  styleUrl: './erp-dashboard.component.scss'
})
export class ErpDashboardComponent implements OnInit {
  @ViewChild('trendCanvas') trendCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('attendanceCanvas') attendanceCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('branchPicker') branchPickerRef?: ElementRef<HTMLElement>;

  loading = signal(false);
  error = signal<string | null>(null);
  kpis = signal<DashboardKpis | null>(null);

  fromDate = signal(toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  toDate = signal(toIsoDate(new Date()));

  branches = signal<DashboardBranch[]>([]);
  selectedBranchCodes = signal<Set<number>>(new Set());
  branchDropdownOpen = signal(false);
  branchSelectionError = signal<string | null>(null);

  departments = signal<DashboardDepartment[]>([]);
  selectedDepartmentCode = signal<number | null>(null);

  userName = computed(() => this.auth.currentUser()?.userName ?? '');
  isAdmin = computed(() => this.auth.currentUser()?.uCatCode === ADMIN_USER_CATEGORY_CODE);

  nonRetrosysBranchCodes = computed(() => this.branches().filter((b) => b.branchCode !== RETROSYS_BRANCH_CODE).map((b) => b.branchCode));

  branchFilterLabel = computed(() => {
    const selected = this.selectedBranchCodes();
    const nonRetrosys = this.nonRetrosysBranchCodes();

    if (selected.size === 1 && selected.has(RETROSYS_BRANCH_CODE)) {
      return this.branches().find((b) => b.branchCode === RETROSYS_BRANCH_CODE)?.branchName ?? 'Retrosys';
    }
    if (nonRetrosys.length > 0 && nonRetrosys.every((c) => selected.has(c)) && selected.size === nonRetrosys.length) {
      return 'All Branches';
    }
    if (selected.size === 1) {
      const code = [...selected][0];
      return this.branches().find((b) => b.branchCode === code)?.branchName ?? '1 Branch';
    }
    return `${selected.size} Branches`;
  });

  private trendChart?: Chart;
  private attendanceChart?: Chart;

  constructor(private dashboardService: DashboardService, private auth: AuthService) {
    effect(() => {
      const data = this.kpis();
      if (data) {
        setTimeout(() => this.renderCharts(data));
      }
    });
  }

  ngOnInit(): void {
    if (!this.isAdmin()) return;
    this.dashboardService.getDepartments().subscribe({
      next: (departments) => this.departments.set(departments),
      error: () => {}
    });
    this.dashboardService.getBranches().subscribe({
      next: (branches) => {
        this.branches.set(branches);
        // Default view excludes Retrosys (INR) so amounts start out in a single currency (AED).
        this.selectedBranchCodes.set(new Set(branches.filter((b) => b.branchCode !== RETROSYS_BRANCH_CODE).map((b) => b.branchCode)));
        this.load();
      },
      error: () => this.load()
    });
  }

  applyFilter(): void {
    this.branchDropdownOpen.set(false);
    this.load();
  }

  toggleBranchDropdown(): void {
    this.branchDropdownOpen.set(!this.branchDropdownOpen());
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.branchDropdownOpen()) return;
    const container = this.branchPickerRef?.nativeElement;
    if (container && !container.contains(event.target as Node)) {
      this.branchDropdownOpen.set(false);
    }
  }

  toggleBranch(branchCode: number): void {
    const current = new Set(this.selectedBranchCodes());
    current.has(branchCode) ? current.delete(branchCode) : current.add(branchCode);
    this.selectedBranchCodes.set(current);

    const hasRetrosys = current.has(RETROSYS_BRANCH_CODE);
    const hasOthers = [...current].some((c) => c !== RETROSYS_BRANCH_CODE);
    this.branchSelectionError.set(
      hasRetrosys && hasOthers
        ? 'You’ve selected AED and INR branches together (Retrosys posts in INR). Untick Retrosys, or untick the other branches, for accurate totals.'
        : null
    );
  }

  isBranchSelected(branchCode: number): boolean {
    return this.selectedBranchCodes().has(branchCode);
  }

  selectAllBranches(): void {
    this.selectedBranchCodes.set(new Set(this.nonRetrosysBranchCodes()));
    this.branchSelectionError.set(null);
  }

  onDepartmentChange(value: string): void {
    this.selectedDepartmentCode.set(value ? Number(value) : null);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    // Never send an empty/null branch filter - that would mean "every branch including
    // Retrosys" on the backend, silently mixing AED and INR again. If nothing is checked,
    // fall back to the same AED-only default the dashboard opens with.
    let selected = this.selectedBranchCodes();
    if (selected.size === 0) {
      selected = new Set(this.nonRetrosysBranchCodes());
      this.selectedBranchCodes.set(selected);
    }
    const branchCode = [...selected].join(',');
    this.dashboardService.getKpis(this.fromDate(), this.toDate(), branchCode, this.selectedDepartmentCode()).subscribe({
      next: (data) => {
        this.kpis.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load dashboard data. Check the API connection.');
        this.loading.set(false);
      }
    });
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value ?? 0);
  }

  formatCurrency(value: number): string {
    const code = this.kpis()?.currencyCode ?? '';
    return code ? `${code} ${this.formatNumber(value)}` : this.formatNumber(value);
  }

  private renderCharts(data: DashboardKpis): void {
    this.renderTrendChart(data);
    this.renderAttendanceChart(data);
  }

  private renderTrendChart(data: DashboardKpis): void {
    const canvas = this.trendCanvasRef?.nativeElement;
    if (!canvas) return;

    this.trendChart?.destroy();
    this.trendChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.trend.map((t) => t.monthLabel),
        datasets: [
          {
            label: 'Sales',
            data: data.trend.map((t) => t.salesValue),
            backgroundColor: '#bf5b3f'
          },
          {
            label: 'Purchase',
            data: data.trend.map((t) => t.purchaseValue),
            backgroundColor: '#263b3b'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${this.formatCurrency(ctx.parsed.y ?? 0)}`
            }
          }
        },
        scales: {
          y: { ticks: { font: { size: 10 } } },
          x: { ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  private renderAttendanceChart(data: DashboardKpis): void {
    const canvas = this.attendanceCanvasRef?.nativeElement;
    if (!canvas) return;

    this.attendanceChart?.destroy();
    const a = data.attendance;
    this.attendanceChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Present', 'Absent', 'On Leave'],
        datasets: [
          {
            data: [a.presentCount, a.absentCount, a.onLeaveCount],
            backgroundColor: ['#8bc49b', '#bf5b3f', '#e18a6f']
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }
}
