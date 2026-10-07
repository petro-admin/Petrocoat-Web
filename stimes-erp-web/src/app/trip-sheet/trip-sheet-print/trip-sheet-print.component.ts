import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import { TripSheetService } from '../services/trip-sheet.service';

@Component({
  selector: 'app-trip-sheet-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trip-sheet-print.component.html',
  styleUrl: './trip-sheet-print.component.scss'
})
export class TripSheetPrintComponent implements OnInit {
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  header = signal<any>({});
  legs = signal<any[]>([]);
  driverName = signal('');
  registrationNo = signal('');

  constructor(
    private route: ActivatedRoute,
    private service: TripSheetService,
    private titleService: Title
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);

    // GetById returns TripSheetHdr's raw columns only (DriverCode/VehicleCode, no joined names) -
    // same as the detail form, resolve the display names client-side from the shared lookups.
    forkJoin({
      record: this.service.getById(id),
      lookups: this.service.getLookups()
    }).subscribe({
      next: ({ record, lookups }) => {
        const hdr = record?.Header ?? record?.header ?? {};
        this.header.set(hdr);
        this.legs.set(record?.Legs ?? record?.legs ?? []);

        const drivers = lookups?.drivers ?? [];
        const vehicles = lookups?.vehicles ?? [];
        const driverCode = this.rowValue(hdr, 'DriverCode');
        const vehicleCode = this.rowValue(hdr, 'VehicleCode');
        const driver = drivers.find((d: any) => Number(this.rowValue(d, 'EmployeeCode')) === Number(driverCode));
        const vehicle = vehicles.find((v: any) => Number(this.rowValue(v, 'VehicleCode')) === Number(vehicleCode));
        this.driverName.set(driver ? this.rowValue(driver, 'EmpFullName') : '');
        this.registrationNo.set(vehicle ? this.rowValue(vehicle, 'RegistrationNo') : '');

        this.loading.set(false);
        this.titleService.setTitle(`${this.rowValue(hdr, 'DocNo') ?? 'Trip Sheet'} TRIP SHEET`);
      },
      error: () => { this.errorMessage.set('Could not load the record.'); this.loading.set(false); }
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
