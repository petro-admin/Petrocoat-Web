import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ResourceReturnService } from '../services/resource-return.service';
import { ApprovalService } from '../../core/services/approval.service';

const FORM_CLASS_NAME = 'Stimes.Erp.App.Win.Production.ResourceRetrurn';

@Component({
  selector: 'app-resource-return-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resource-return-print.component.html',
  styleUrl: './resource-return-print.component.scss'
})
export class ResourceReturnPrintComponent implements OnInit {
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  header = signal<any>({});
  materials = signal<any[]>([]);
  consumables = signal<any[]>([]);
  toolsAndEquipment = signal<any[]>([]);
  generalServices = signal<any[]>([]);
  subContract = signal<any[]>([]);
  toolsAndEquipmentHire = signal<any[]>([]);

  approvalStatusText = signal('Pending');
  approvedByName = signal('');

  constructor(
    private route: ActivatedRoute,
    private service: ResourceReturnService,
    private approvalService: ApprovalService,
    private titleService: Title
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);

    this.service.getById(id).subscribe({
      next: res => {
        this.header.set(res?.Header ?? res?.header ?? {});
        this.materials.set(res?.Materials ?? res?.materials ?? []);
        this.consumables.set(res?.Consumables ?? res?.consumables ?? []);
        this.toolsAndEquipment.set(res?.ToolsAndEquipment ?? res?.toolsAndEquipment ?? []);
        this.generalServices.set(res?.GeneralServices ?? res?.generalServices ?? []);
        this.subContract.set(res?.SubContract ?? res?.subContract ?? []);
        this.toolsAndEquipmentHire.set(res?.ToolsAndEquipmentHire ?? res?.toolsAndEquipmentHire ?? []);
        this.loading.set(false);
        this.titleService.setTitle(`${this.rowValue(this.header(), 'MatReturnNo') ?? 'Resource Return'} RESOURCE RETURN`);
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
