import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DailySiteService } from '../services/daily-site.service';

// Matches desktop's PrintButton_Click / Report_DailySiteReport.rdlc (not the "Demo" variant) -
// same 4 datasets, same field names, rendered as a clean web print page instead of an RDLC report.
@Component({
  selector: 'app-daily-site-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-site-print.component.html',
  styleUrl: './daily-site-print.component.scss'
})
export class DailySitePrintComponent implements OnInit {
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  header = signal<any>(null);
  scopeOfWork = signal<any[]>([]);
  material = signal<any[]>([]);
  consumablesOrMachineries = signal<any[]>([]);

  totals = computed(() => {
    const rows = this.consumablesOrMachineries();
    const sum = (key: string) => rows.reduce((total, row) => total + this.toNumber(this.read(row, key)), 0);
    return {
      hrs: sum('Hrs'),
      idle: sum('Idle'),
      transport: sum('Transport'),
      consumableQuantity: sum('ConsumableQuantity'),
      consumableUsed: sum('ConsumableUsed'),
      machineriesQuantity: sum('MachineriesQuantity'),
      machineriesUsed: sum('MachineriesUsed')
    };
  });

  isPreview = false;

  constructor(private route: ActivatedRoute, private dailySiteService: DailySiteService) {}

  ngOnInit(): void {
    // Matches desktop's "Demo" print button: preview the report from whatever is currently on
    // screen, before saving, instead of querying the database.
    if (this.route.snapshot.queryParamMap.get('preview') === '1') {
      this.isPreview = true;
      this.loadFromPreview();
      return;
    }

    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.dailySiteService.getReport(id).subscribe({
      next: res => {
        this.header.set(this.firstRow(res, 'Header', 'header'));
        this.scopeOfWork.set(this.rows(res, 'ScopeOfWork', 'scopeOfWork'));
        this.material.set(this.rows(res, 'Material', 'material'));
        this.consumablesOrMachineries.set(this.rows(res, 'ConsumablesOrMachineries', 'consumablesOrMachineries'));
        this.loading.set(false);
      },
      error: () => { this.errorMessage.set('Could not load the report.'); this.loading.set(false); }
    });
  }

  private loadFromPreview(): void {
    const raw = localStorage.getItem('dailySitePrintPreview');
    if (!raw) {
      this.errorMessage.set('No preview data found — open this from the Demo button on the form.');
      this.loading.set(false);
      return;
    }
    const data = JSON.parse(raw);
    this.header.set(data.header ?? {});
    this.scopeOfWork.set(data.scopeOfWork ?? []);
    this.material.set(data.material ?? []);
    this.consumablesOrMachineries.set(data.consumablesOrMachineries ?? []);
    this.loading.set(false);
  }

  print(): void {
    window.print();
  }

  rowValue(record: any, ...keys: string[]): any {
    return this.read(record, ...keys);
  }

  private read(record: any, ...keys: string[]): any {
    for (const key of keys) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (record?.[key] !== undefined) return record[key];
      if (record?.[camelKey] !== undefined) return record[camelKey];
    }
    return undefined;
  }

  private toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private firstRow(response: any, ...keys: string[]): any {
    for (const key of keys) {
      const value = this.read(response, key);
      if (Array.isArray(value) && value.length > 0) return value[0];
    }
    return {};
  }

  private rows(response: any, ...keys: string[]): any[] {
    for (const key of keys) {
      const value = this.read(response, key);
      if (Array.isArray(value)) return value;
    }
    return [];
  }
}
