import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { LeaveApplicationService } from '../services/leave-application.service';
import { ApprovalService } from '../../core/services/approval.service';

// Web equivalent of the desktop's RDLC report (LeaveApplicationReport.rdlc), sourced from the
// same usp_EmployeeRequestLA_view data the desktop report binds to.
const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Payroll_System.LeaveApplicationForm';

@Component({
  selector: 'app-leave-application-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leave-application-print.component.html',
  styleUrl: './leave-application-print.component.scss'
})
export class LeaveApplicationPrintComponent implements OnInit {
  loading = signal(true);
  errorMessage = signal<string | null>(null);
  data = signal<any>({});

  approvalStatusText = signal('Pending');
  approvedByName = signal('');

  constructor(
    private route: ActivatedRoute,
    private service: LeaveApplicationService,
    private approvalService: ApprovalService,
    private titleService: Title
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);

    this.service.getById(id).subscribe({
      next: res => {
        this.data.set(res ?? {});
        this.loading.set(false);
        this.titleService.setTitle(`${this.rowValue(res, 'RequestNo') ?? 'Leave Application'} LEAVE APPLICATION`);
      },
      error: () => { this.errorMessage.set('Could not load the record.'); this.loading.set(false); }
    });

    this.approvalService.getSettings(FORM_CLASS_NAME).subscribe({
      next: settings => {
        if (!settings.moduleCode) return;
        this.approvalService.getStatus(settings.moduleCode, id).subscribe({
          next: status => {
            const currentStatus = this.rowValue(status.action, 'CurrentStatus');
            this.approvalStatusText.set(currentStatus === 'A' ? 'Approved' : currentStatus === 'D' ? 'Denied' : 'Pending');
            this.approvedByName.set(this.rowValue(status.action, 'LastApprovedUser') ?? '');
          },
          error: () => {}
        });
      },
      error: () => {}
    });
  }

  print(): void {
    window.print();
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
