import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private base = `${environment.apiBaseUrl}/account`;

  constructor(private http: HttpClient) {}

  getCurrency(branchCode: number): Observable<any> {
    return this.http.get<any>(`${this.base}/currency`, { params: { branchCode } });
  }

  getGroups(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/groups`);
  }

  getHeads(branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/heads`, { params: { branchCode } });
  }

  getSuppliers(branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/suppliers`, { params: { branchCode } });
  }

  getCustomers(branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/customers`, { params: { branchCode } });
  }

  getHeadById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/heads/${code}`);
  }

  getHeadBalance(code: number): Observable<{ balance: number; drCr: string }> {
    return this.http.get<{ balance: number; drCr: string }>(`${this.base}/heads/${code}/balance`);
  }

  saveHead(payload: any): Observable<any> {
    return this.http.post(`${this.base}/heads/save`, payload);
  }

  deleteHead(code: number): Observable<any> {
    return this.http.delete(`${this.base}/heads/${code}`);
  }

  generateVoucherNo(voucherType: string): Observable<{ voucherNo: string }> {
    return this.http.get<{ voucherNo: string }>(`${this.base}/vouchers/generate-no`, { params: { voucherType } });
  }

  getVoucherList(branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/vouchers`, { params: { branchCode } });
  }

  getVoucherById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/vouchers/${code}`);
  }

  saveVoucher(payload: any): Observable<any> {
    return this.http.post(`${this.base}/vouchers/save`, payload);
  }

  deleteVoucher(code: number): Observable<any> {
    return this.http.delete(`${this.base}/vouchers/${code}`);
  }

  getLedger(accountHeadCodes: number[], fromDate: string, toDate: string): Observable<{ accountHeadCode: number; headName: string; openingBalance: number; lines: any[] }[]> {
    // POST, not GET - "Select all" can put hundreds of Account Head codes in this call, which
    // would overflow a GET URL's length limit if sent as query params.
    return this.http.post<{ accountHeadCode: number; headName: string; openingBalance: number; lines: any[] }[]>(
      `${this.base}/reports/ledger`, { accountHeadCodes, fromDate, toDate });
  }

  getTrialBalance(branchCode: number, asOfDate: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reports/trial-balance`, { params: { branchCode, asOfDate } });
  }

  getBalanceSheet(branchCode: number, asOfDate: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reports/balance-sheet`, { params: { branchCode, asOfDate } });
  }

  getProfitAndLoss(branchCode: number, fromDate: string, toDate: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reports/profit-and-loss`, { params: { branchCode, fromDate, toDate } });
  }

  getCostCenters(branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/cost-centers`, { params: { branchCode } });
  }

  // Journal Entry's "Project" column - same shared Sales Order lookup Daily Site/Labour
  // Attendance already use.
  getSalesOrders(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/sales-orders`);
  }

  getCostCenterById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/cost-centers/${code}`);
  }

  saveCostCenter(payload: any): Observable<any> {
    return this.http.post(`${this.base}/cost-centers/save`, payload);
  }

  deleteCostCenter(code: number): Observable<any> {
    return this.http.delete(`${this.base}/cost-centers/${code}`);
  }

  generateSalesInvoiceNo(): Observable<{ invoiceNo: string }> {
    return this.http.get<{ invoiceNo: string }>(`${this.base}/sales-invoices/generate-no`);
  }

  getSalesInvoiceList(branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/sales-invoices`, { params: { branchCode } });
  }

  getOpenSalesInvoices(customerCode: number, branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/sales-invoices/open`, { params: { customerCode, branchCode } });
  }

  getSalesInvoiceById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/sales-invoices/${code}`);
  }

  saveSalesInvoice(payload: any): Observable<any> {
    return this.http.post(`${this.base}/sales-invoices/save`, payload);
  }

  deleteSalesInvoice(code: number): Observable<any> {
    return this.http.delete(`${this.base}/sales-invoices/${code}`);
  }

  generatePurchaseInvoiceNo(): Observable<{ invoiceNo: string }> {
    return this.http.get<{ invoiceNo: string }>(`${this.base}/purchase-invoices/generate-no`);
  }

  getPurchaseInvoiceList(branchCode: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/purchase-invoices`, { params: { branchCode } });
  }

  getOpenPurchaseInvoices(supplierCode: number, branchCode: number, excludeVoucherCode = 0): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/purchase-invoices/open`, { params: { supplierCode, branchCode, excludeVoucherCode } });
  }

  getPurchaseInvoiceById(code: number): Observable<any> {
    return this.http.get<any>(`${this.base}/purchase-invoices/${code}`);
  }

  savePurchaseInvoice(payload: any): Observable<any> {
    return this.http.post(`${this.base}/purchase-invoices/save`, payload);
  }

  deletePurchaseInvoice(code: number): Observable<any> {
    return this.http.delete(`${this.base}/purchase-invoices/${code}`);
  }

  uploadDocument(file: File, branchCode: number): Observable<{ fileName: string; originalName: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ fileName: string; originalName: string }>(`${this.base}/upload`, formData, { params: { branchCode } });
  }

  // A plain link can't send the Authorization header this [Authorize]-protected endpoint needs,
  // so the file is fetched through HttpClient and turned into a blob URL to open/download.
  getDocumentBlob(path: string): Observable<Blob> {
    return this.http.get(`${this.base}/document`, { params: { path }, responseType: 'blob' });
  }
}
