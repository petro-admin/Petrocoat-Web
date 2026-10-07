import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { AccountService } from '../services/account.service';

@Component({
  selector: 'app-voucher-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './voucher-print.component.html',
  styleUrl: './voucher-print.component.scss'
})
export class VoucherPrintComponent implements OnInit {
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  header = signal<any>({});
  lines = signal<any[]>([]);

  totalDebit = computed(() => this.round2(this.lines().reduce((sum, l) => sum + this.toNumber(this.rowValue(l, 'DebitAmount')), 0)));
  totalCredit = computed(() => this.round2(this.lines().reduce((sum, l) => sum + this.toNumber(this.rowValue(l, 'CreditAmount')), 0)));

  constructor(
    private route: ActivatedRoute,
    private service: AccountService,
    private titleService: Title
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);

    this.service.getVoucherById(id).subscribe({
      next: (res: any) => {
        const hdr = res?.Header ?? res?.header ?? {};
        this.header.set(hdr);
        this.lines.set(res?.Lines ?? res?.lines ?? []);
        this.loading.set(false);
        this.titleService.setTitle(`${this.rowValue(hdr, 'VoucherNo') ?? 'Voucher'}`);
      },
      error: () => { this.errorMessage.set('Could not load the record.'); this.loading.set(false); }
    });
  }

  print(): void {
    window.print();
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  toNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  rowValue(record: any, ...keys: string[]): any {
    for (const key of keys) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      if (record?.[key] !== undefined) return record[key];
      if (record?.[camelKey] !== undefined) return record[camelKey];
    }
    return undefined;
  }
}
