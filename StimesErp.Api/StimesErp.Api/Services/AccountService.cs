using System.Data;
using System.Linq;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class AccountService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public AccountService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // Same shared network-storage convention VehicleServiceRepair/AccidentReport's own document
        // upload uses - a redeploy of the API can never wipe an attached document.
        public string GetServerPath(int branchCode)
        {
            var dt = _db.GetDataTableFromQuery(
                "select top 1 ServerPath from payrollSettings where BranchCode = @BranchCode and ServerPath is not null and LEN(ServerPath) > 0",
                new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });
            if (dt.Rows.Count == 0)
                dt = _db.GetDataTableFromQuery(
                    "select top 1 ServerPath from payrollSettings where ServerPath is not null and LEN(ServerPath) > 0");
            return dt.Rows.Count > 0 ? dt.Rows[0]["ServerPath"] as string ?? "" : "";
        }

        // Reuses the existing AdminBranchInfo/AdminCurrencyInfo tables (already model India/UAE) -
        // no new currency infrastructure needed for the Accounts module.
        public DataTable GetCurrencyForBranch(int branchCode) => _db.GetDataTableFromQuery(
            @"select C.CurrencyCode, C.CurrShortName, C.CurrName, C.Symbol
              from AdminBranchInfo B
              inner join AdminCurrencyInfo C on C.CurrencyCode = B.CurrencyCode
              where B.BranchCode = @BranchCode",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        // Groups are seeded once (Tally's own standard Primary Group set) and not user-editable
        // from here, same as Tally itself treats its built-in Primary Groups - only the Account
        // Heads (the actual ledgers, e.g. "HSBC Bank AED") are created/managed by users.
        public DataTable GetGroups() => _db.GetDataTableFromQuery(
            @"select G.Code, G.GroupName, G.ParentGroupCode, P.GroupName as ParentGroupName, G.Nature
              from WebAccountGroup G
              left join WebAccountGroup P on P.Code = G.ParentGroupCode
              order by ISNULL(G.ParentGroupCode, G.Code), G.ParentGroupCode, G.GroupName");

        public DataTable GetHeads(int branchCode) => _db.GetDataTableFromQuery(
            @"select H.Code, H.HeadName, H.GroupCode, G.GroupName, H.BranchCode, H.OpeningBalance,
                     H.OpeningBalanceType, H.Remarks, H.IsActive
              from WebAccountHead H
              inner join WebAccountGroup G on G.Code = H.GroupCode
              where H.BranchCode = @BranchCode
              order by H.HeadName",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        // Sourced from the desktop's own real Supplier/Customer Master (purchaseSupplierInfo /
        // sopCustomerInfo) rather than just filtering WebAccountHead by group - a supplier picker
        // built off actual vendor names is what the Ledger Type "Supplier"/"Customer" filter is for.
        // Read-only: only ever queries these desktop tables, never writes to them. SourceAccountCode
        // (backfilled once from each imported head's "Imported from desktop AccountCode N" Remarks)
        // is what links a Web Account Head back to the desktop's accAccountHead.Accountcode that
        // purchaseSupplierInfo.SupplierAccCode / sopCustomerInfo.CustomerAccCode point to.
        // Branch 6 (RETROSYS BHARATH LLP) is a genuinely separate entity - different country/
        // currency (CountryCode/CurrencyCode 1 = India, vs 3 = UAE for every other branch) - so its
        // Supplier/Customer list must stay strictly isolated to its own BranchCode. The UAE branches
        // (2/3/4) share one combined pool instead of being filtered by BranchCode: their underlying
        // desktop data isn't cleanly separated per branch (a supplier's own BranchCodes tag and its
        // resolved WebAccountHead.BranchCode don't always agree - see GetOpenPurchaseInvoices'
        // comment on the same quirk), so filtering them individually hid real, valid suppliers.
        public DataTable GetSuppliers(int branchCode) => _db.GetDataTableFromQuery(
            @"select S.SupplierCode, S.SupplierName, H.Code as AccountHeadCode
              from purchaseSupplierInfo S
              inner join WebAccountHead H on H.SourceAccountCode = S.SupplierAccCode
              where ((@BranchCode = 6 and H.BranchCode = 6) or (@BranchCode <> 6 and H.BranchCode <> 6))
                and S.SupplierStatus = 'Active'
              order by S.SupplierName",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        public DataTable GetCustomers(int branchCode) => _db.GetDataTableFromQuery(
            @"select C.CustomerCode, C.CustomerName, H.Code as AccountHeadCode
              from sopCustomerInfo C
              inner join WebAccountHead H on H.SourceAccountCode = C.CustomerAccCode
              where ((@BranchCode = 6 and H.BranchCode = 6) or (@BranchCode <> 6 and H.BranchCode <> 6))
                and C.CustomerStatus = 'Y'
              order by C.CustomerName",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        public DataTable GetHeadById(int code) => _db.GetDataTableFromQuery(
            "select * from WebAccountHead where Code = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public (string Result, int Code) SaveHead(AccountHeadSaveRequest req, int userCode)
        {
            if (req.Code > 0)
            {
                _db.ExecuteNonQuery(
                    @"update WebAccountHead set
                        HeadName=@HeadName, GroupCode=@GroupCode, OpeningBalance=@OpeningBalance,
                        OpeningBalanceType=@OpeningBalanceType, Remarks=@Remarks, IsActive=@IsActive
                      where Code=@Code",
                    BuildParams(req, userCode, includeCode: true));
                _audit.LogEdit("Accounts - Chart of Accounts", $"{req.HeadName} - Account Head Edited");
                return ("Updated Successfully", req.Code);
            }

            var dt = _db.GetDataTableFromQuery(
                @"insert into WebAccountHead (HeadName, GroupCode, BranchCode, OpeningBalance, OpeningBalanceType, Remarks, IsActive, CreatedBy)
                  output inserted.Code
                  values (@HeadName, @GroupCode, @BranchCode, @OpeningBalance, @OpeningBalanceType, @Remarks, @IsActive, @UserCode)",
                BuildParams(req, userCode, includeCode: false));
            var code = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["Code"]) : 0;
            _audit.LogAdd("Accounts - Chart of Accounts", $"{req.HeadName} - Account Head Added");
            return ("Saved Successfully", code);
        }

        public void DeleteHead(int code)
        {
            _db.ExecuteNonQuery(
                "delete from WebAccountHead where Code = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            _audit.LogDelete("Accounts - Chart of Accounts", $"Account Head Code {code} deleted");
        }

        // ---------- Vouchers ----------

        public string GenerateVoucherNo(string voucherType)
        {
            var prefix = voucherType switch
            {
                "Payment" => "PV",
                "Receipt" => "RV",
                "Contra" => "CV",
                "PettyCash" => "PC",
                "EmployeePayment" => "EP",
                "PettyCashPayment" => "PCP",
                _ => "JV"
            };
            var dt = _db.GetDataTableFromQuery(
                "select @Prefix + '-' + RIGHT('000000' + CAST(ISNULL(MAX(Code),0)+1 AS VARCHAR), 6) as VoucherNo from WebAccountVoucherHdr where VoucherType = @VoucherType",
                new[]
                {
                    SqlHelper.Param("@Prefix", SqlDbType.VarChar, prefix, 10),
                    SqlHelper.Param("@VoucherType", SqlDbType.VarChar, voucherType, 20)
                });
            return dt.Rows.Count > 0 ? dt.Rows[0]["VoucherNo"]?.ToString() ?? "" : "";
        }

        public DataTable GetVoucherList(int branchCode) => _db.GetDataTableFromQuery(
            @"select H.Code, H.VoucherNo, H.VoucherDate, H.VoucherType, H.Narration,
                     (select SUM(DebitAmount) from WebAccountVoucherDtl D where D.VoucherHdrCode = H.Code) as TotalAmount
              from WebAccountVoucherHdr H
              where H.BranchCode = @BranchCode
              order by H.VoucherDate desc, H.Code desc",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        public DataTable GetVoucherHeader(int code) => _db.GetDataTableFromQuery(
            "select * from WebAccountVoucherHdr where Code = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public DataTable GetVoucherLines(int code) => _db.GetDataTableFromQuery(
            @"select D.Code, D.SlNo, D.AccountHeadCode, H.HeadName, D.DebitAmount, D.CreditAmount, D.Narration,
                     D.CostCenterCode, C.CostCenterName, D.ReferenceNo, D.ProjectSoCode, SO.SONo,
                     D.VatApplicable, D.VatAmount, D.SupplierCode, S.SupplierName, D.AttachmentPath, D.LineDate, D.Trn
              from WebAccountVoucherDtl D
              inner join WebAccountHead H on H.Code = D.AccountHeadCode
              left join WebCostCenter C on C.Code = D.CostCenterCode
              left join SalesOrderNew SO on SO.SOCode = D.ProjectSoCode
              left join purchaseSupplierInfo S on S.SupplierCode = D.SupplierCode
              where D.VoucherHdrCode = @Code
              order by D.SlNo",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        // Same shared Sales Order lookup Daily Site/Labour Attendance's own dropdown uses - the
        // Journal Entry form's "Project" column, letting a line be costed against a specific job.
        public DataTable GetSalesOrders() => _db.GetDataTableFromProcedure("usp_GetDailySiteSalesOrderNo");

        // ---------- Cost Centers ----------

        public DataTable GetCostCenters(int branchCode) => _db.GetDataTableFromQuery(
            "select Code, CostCenterName, BranchCode, IsActive from WebCostCenter where BranchCode = @BranchCode order by CostCenterName",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        public DataTable GetCostCenterById(int code) => _db.GetDataTableFromQuery(
            "select * from WebCostCenter where Code = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public (string Result, int Code) SaveCostCenter(CostCenterSaveRequest req, int userCode)
        {
            if (req.Code > 0)
            {
                _db.ExecuteNonQuery(
                    "update WebCostCenter set CostCenterName=@Name, IsActive=@IsActive where Code=@Code",
                    new[]
                    {
                        SqlHelper.Param("@Name", SqlDbType.VarChar, req.CostCenterName ?? "", 150),
                        SqlHelper.Param("@IsActive", SqlDbType.Bit, req.IsActive),
                        SqlHelper.Param("@Code", SqlDbType.Int, req.Code)
                    });
                _audit.LogEdit("Accounts - Cost Center", $"{req.CostCenterName} - Cost Center Edited", req.BranchCode);
                return ("Updated Successfully", req.Code);
            }

            var dt = _db.GetDataTableFromQuery(
                @"insert into WebCostCenter (CostCenterName, BranchCode, IsActive, CreatedBy)
                  output inserted.Code
                  values (@Name, @BranchCode, @IsActive, @UserCode)",
                new[]
                {
                    SqlHelper.Param("@Name", SqlDbType.VarChar, req.CostCenterName ?? "", 150),
                    SqlHelper.Param("@BranchCode", SqlDbType.Int, req.BranchCode),
                    SqlHelper.Param("@IsActive", SqlDbType.Bit, req.IsActive),
                    SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
                });
            var code = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["Code"]) : 0;
            _audit.LogAdd("Accounts - Cost Center", $"{req.CostCenterName} - Cost Center Added", req.BranchCode);
            return ("Saved Successfully", code);
        }

        public void DeleteCostCenter(int code)
        {
            _db.ExecuteNonQuery(
                "delete from WebCostCenter where Code = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            _audit.LogDelete("Accounts - Cost Center", $"Cost Center Code {code} deleted");
        }

        // The core double-entry rule: a voucher can only be saved when its lines' total Debit
        // equals total Credit - enforced here, not just in the UI, since this is the one
        // invariant the whole rest of the accounts module (Ledger/Trial Balance/Balance Sheet)
        // depends on staying true for every single voucher.
        public (string Result, int Code) SaveVoucher(VoucherSaveRequest req, int userCode)
        {
            var totalDebit = req.Lines.Sum(l => l.DebitAmount);
            var totalCredit = req.Lines.Sum(l => l.CreditAmount);
            if (req.Lines.Count < 2 || totalDebit != totalCredit || totalDebit == 0)
                return ("Voucher is not balanced - total Debit must equal total Credit.", 0);

            int code;
            if (req.Code > 0)
            {
                code = req.Code;
                _db.ExecuteNonQuery(
                    @"update WebAccountVoucherHdr set
                        VoucherDate=@VoucherDate, VoucherType=@VoucherType, Narration=@Narration, RefNo=@RefNo,
                        PaymentMethod=@PaymentMethod, ChequeNo=@ChequeNo, ChequeDate=@ChequeDate, PettyCashMode=@PettyCashMode,
                        UpdatedBy=@UserCode, UpdatedAt=GETDATE()
                      where Code=@Code",
                    new[]
                    {
                        SqlHelper.Param("@VoucherDate", SqlDbType.Date, req.VoucherDate),
                        SqlHelper.Param("@VoucherType", SqlDbType.VarChar, req.VoucherType, 20),
                        SqlHelper.Param("@Narration", SqlDbType.VarChar, req.Narration ?? "", 500),
                        SqlHelper.Param("@RefNo", SqlDbType.VarChar, req.RefNo ?? "", 100),
                        SqlHelper.Param("@PaymentMethod", SqlDbType.VarChar, (object?)req.PaymentMethod ?? DBNull.Value, 10),
                        SqlHelper.Param("@ChequeNo", SqlDbType.VarChar, (object?)req.ChequeNo ?? DBNull.Value, 50),
                        SqlHelper.Param("@ChequeDate", SqlDbType.Date, (object?)req.ChequeDate ?? DBNull.Value),
                        SqlHelper.Param("@PettyCashMode", SqlDbType.VarChar, (object?)req.PettyCashMode ?? DBNull.Value, 10),
                        SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                        SqlHelper.Param("@Code", SqlDbType.Int, code)
                    });
            }
            else
            {
                var dt = _db.GetDataTableFromQuery(
                    @"insert into WebAccountVoucherHdr (VoucherNo, VoucherDate, VoucherType, Narration, RefNo, PaymentMethod, ChequeNo, ChequeDate, PettyCashMode, BranchCode, CreatedBy)
                      output inserted.Code
                      values (@VoucherNo, @VoucherDate, @VoucherType, @Narration, @RefNo, @PaymentMethod, @ChequeNo, @ChequeDate, @PettyCashMode, @BranchCode, @UserCode)",
                    new[]
                    {
                        SqlHelper.Param("@VoucherNo", SqlDbType.VarChar, req.VoucherNo ?? "", 30),
                        SqlHelper.Param("@VoucherDate", SqlDbType.Date, req.VoucherDate),
                        SqlHelper.Param("@VoucherType", SqlDbType.VarChar, req.VoucherType, 20),
                        SqlHelper.Param("@Narration", SqlDbType.VarChar, req.Narration ?? "", 500),
                        SqlHelper.Param("@RefNo", SqlDbType.VarChar, req.RefNo ?? "", 100),
                        SqlHelper.Param("@PaymentMethod", SqlDbType.VarChar, (object?)req.PaymentMethod ?? DBNull.Value, 10),
                        SqlHelper.Param("@ChequeNo", SqlDbType.VarChar, (object?)req.ChequeNo ?? DBNull.Value, 50),
                        SqlHelper.Param("@ChequeDate", SqlDbType.Date, (object?)req.ChequeDate ?? DBNull.Value),
                        SqlHelper.Param("@PettyCashMode", SqlDbType.VarChar, (object?)req.PettyCashMode ?? DBNull.Value, 10),
                        SqlHelper.Param("@BranchCode", SqlDbType.Int, req.BranchCode),
                        SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
                    });
                code = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["Code"]) : 0;
            }

            _db.ExecuteNonQuery(
                "delete from WebAccountVoucherDtl where VoucherHdrCode = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            foreach (var line in req.Lines)
            {
                _db.ExecuteNonQuery(
                    @"insert into WebAccountVoucherDtl (VoucherHdrCode, SlNo, AccountHeadCode, DebitAmount, CreditAmount, Narration, CostCenterCode, ReferenceNo, ProjectSoCode, VatApplicable, VatAmount, SupplierCode, AttachmentPath, LineDate, Trn)
                      values (@VoucherHdrCode, @SlNo, @AccountHeadCode, @DebitAmount, @CreditAmount, @Narration, @CostCenterCode, @ReferenceNo, @ProjectSoCode, @VatApplicable, @VatAmount, @SupplierCode, @AttachmentPath, @LineDate, @Trn)",
                    new[]
                    {
                        SqlHelper.Param("@VoucherHdrCode", SqlDbType.Int, code),
                        SqlHelper.Param("@SlNo", SqlDbType.Int, line.SlNo),
                        SqlHelper.Param("@AccountHeadCode", SqlDbType.Int, line.AccountHeadCode),
                        SqlHelper.Param("@DebitAmount", SqlDbType.Decimal, line.DebitAmount),
                        SqlHelper.Param("@CreditAmount", SqlDbType.Decimal, line.CreditAmount),
                        SqlHelper.Param("@Narration", SqlDbType.VarChar, line.Narration ?? "", 300),
                        SqlHelper.Param("@CostCenterCode", SqlDbType.Int, line.CostCenterCode),
                        SqlHelper.Param("@ReferenceNo", SqlDbType.VarChar, line.ReferenceNo ?? "", 100),
                        SqlHelper.Param("@ProjectSoCode", SqlDbType.Int, line.ProjectSoCode),
                        SqlHelper.Param("@VatApplicable", SqlDbType.Bit, line.VatApplicable),
                        SqlHelper.Param("@VatAmount", SqlDbType.Decimal, line.VatAmount),
                        SqlHelper.Param("@SupplierCode", SqlDbType.Int, line.SupplierCode),
                        SqlHelper.Param("@AttachmentPath", SqlDbType.VarChar, line.AttachmentPath ?? "", 500),
                        SqlHelper.Param("@LineDate", SqlDbType.Date, line.LineDate),
                        SqlHelper.Param("@Trn", SqlDbType.VarChar, line.Trn ?? "", 50)
                    });
            }

            // Payment/Receipt only - which open Purchase/Sales Invoices this voucher pays against
            // (empty for Journal/Contra/invoice-linked vouchers, which just no-ops here).
            _db.ExecuteNonQuery(
                "delete from WebInvoiceAllocation where VoucherHdrCode = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            foreach (var alloc in req.Allocations)
            {
                if (alloc.AllocatedAmount <= 0) continue;
                _db.ExecuteNonQuery(
                    @"insert into WebInvoiceAllocation (InvoiceType, InvoiceHdrCode, VoucherHdrCode, AllocatedAmount)
                      values (@InvoiceType, @InvoiceHdrCode, @VoucherHdrCode, @AllocatedAmount)",
                    new[]
                    {
                        SqlHelper.Param("@InvoiceType", SqlDbType.VarChar, alloc.InvoiceType, 20),
                        SqlHelper.Param("@InvoiceHdrCode", SqlDbType.Int, alloc.InvoiceHdrCode),
                        SqlHelper.Param("@VoucherHdrCode", SqlDbType.Int, code),
                        SqlHelper.Param("@AllocatedAmount", SqlDbType.Decimal, alloc.AllocatedAmount)
                    });
            }

            // Attached documents (police report / cheque scan / anything else) - same full-replace
            // pattern as Lines/Allocations, so a removed attachment on edit actually disappears.
            _db.ExecuteNonQuery(
                "delete from WebVoucherDocument where VoucherHdrCode = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            foreach (var doc in req.Documents.Where(d => !string.IsNullOrWhiteSpace(d.FilePath)))
            {
                _db.ExecuteNonQuery(
                    @"insert into WebVoucherDocument (VoucherHdrCode, SlNo, FileName, FilePath)
                      values (@VoucherHdrCode, @SlNo, @FileName, @FilePath)",
                    new[]
                    {
                        SqlHelper.Param("@VoucherHdrCode", SqlDbType.Int, code),
                        SqlHelper.Param("@SlNo", SqlDbType.Int, doc.SlNo),
                        SqlHelper.Param("@FileName", SqlDbType.VarChar, doc.FileName ?? "", 300),
                        SqlHelper.Param("@FilePath", SqlDbType.VarChar, doc.FilePath, 500)
                    });
            }

            if (req.Code > 0) _audit.LogEdit("Accounts - Voucher", $"{req.VoucherNo} - {req.VoucherType} Voucher Edited", req.BranchCode);
            else _audit.LogAdd("Accounts - Voucher", $"{req.VoucherNo} - {req.VoucherType} Voucher Added", req.BranchCode);

            return (req.Code > 0 ? "Updated Successfully" : "Saved Successfully", code);
        }

        public DataTable GetVoucherAllocations(int voucherHdrCode) => _db.GetDataTableFromQuery(
            @"select A.Code, A.InvoiceType, A.InvoiceHdrCode, A.AllocatedAmount,
                     case
                       when A.InvoiceType = 'Sales' then SH.InvoiceNo
                       when A.InvoiceType = 'Purchase' then PH.InvoiceNo
                       when A.InvoiceType = 'DesktopPurchase' then DPH.PurchaseInvoiceNo
                       else null
                     end as InvoiceNo
              from WebInvoiceAllocation A
              left join WebSalesInvoiceHdr SH on A.InvoiceType = 'Sales' and SH.Code = A.InvoiceHdrCode
              left join WebPurchaseInvoiceHdr PH on A.InvoiceType = 'Purchase' and PH.Code = A.InvoiceHdrCode
              left join purchasePurchaseInvoiceHdr DPH on A.InvoiceType = 'DesktopPurchase' and DPH.PurchaseInvoiceCode = A.InvoiceHdrCode
              where A.VoucherHdrCode = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, voucherHdrCode) });

        public DataTable GetVoucherDocuments(int voucherHdrCode) => _db.GetDataTableFromQuery(
            "select Code, SlNo, FileName, FilePath, UploadedAt from WebVoucherDocument where VoucherHdrCode = @Code order by SlNo",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, voucherHdrCode) });

        // Current signed balance (Opening Balance + every posted movement to date, no date cutoff) -
        // same formula Trial Balance uses per row, just for one Account Head. Matches the "Balance"
        // field shown next to the Paid From/Received In account on the desktop's own Payment screen.
        public decimal GetAccountBalance(int accountHeadCode)
        {
            var dt = _db.GetDataTableFromQuery(
                @"select (case when H.OpeningBalanceType = 'Cr' then -H.OpeningBalance else H.OpeningBalance end
                           + ISNULL((select SUM(D.DebitAmount - D.CreditAmount)
                                     from WebAccountVoucherDtl D
                                     inner join WebAccountVoucherHdr VH on VH.Code = D.VoucherHdrCode
                                     where D.AccountHeadCode = H.Code), 0)) as Balance
                  from WebAccountHead H where H.Code = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, accountHeadCode) });
            return dt.Rows.Count > 0 ? Convert.ToDecimal(dt.Rows[0]["Balance"]) : 0;
        }

        public void DeleteVoucher(int code)
        {
            _db.ExecuteNonQuery(
                @"delete from WebInvoiceAllocation where VoucherHdrCode=@Code;
                  delete from WebVoucherDocument where VoucherHdrCode=@Code;
                  delete from WebAccountVoucherDtl where VoucherHdrCode=@Code;
                  delete from WebAccountVoucherHdr where Code=@Code;",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            _audit.LogDelete("Accounts - Voucher", $"Voucher Code {code} deleted");
        }

        // ---------- Sales Invoices ----------

        public string GenerateInvoiceNo(string invoiceType)
        {
            var isSale = invoiceType != "Purchase";
            var table = isSale ? "WebSalesInvoiceHdr" : "WebPurchaseInvoiceHdr";
            var prefix = isSale ? "SI" : "PI";
            var dt = _db.GetDataTableFromQuery(
                $"select '{prefix}' + '-' + RIGHT('000000' + CAST(ISNULL(MAX(Code),0)+1 AS VARCHAR), 6) as InvoiceNo from {table}");
            return dt.Rows.Count > 0 ? dt.Rows[0]["InvoiceNo"]?.ToString() ?? "" : "";
        }

        public DataTable GetSalesInvoiceList(int branchCode) => _db.GetDataTableFromQuery(
            @"select H.Code, H.InvoiceNo, H.InvoiceDate, H.DueDate, H.CustomerCode, C.HeadName as CustomerName, H.TotalAmount, H.Narration,
                     ISNULL((select SUM(AllocatedAmount) from WebInvoiceAllocation A where A.InvoiceType = 'Sales' and A.InvoiceHdrCode = H.Code), 0) as PaidAmount
              from WebSalesInvoiceHdr H
              inner join WebAccountHead C on C.Code = H.CustomerCode
              where H.BranchCode = @BranchCode
              order by H.InvoiceDate desc, H.Code desc",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        public DataTable GetSalesInvoiceHeader(int code) => _db.GetDataTableFromQuery(
            "select * from WebSalesInvoiceHdr where Code = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public DataTable GetSalesInvoiceLines(int code) => _db.GetDataTableFromQuery(
            @"select D.Code, D.SlNo, D.AccountHeadCode, H.HeadName, D.Amount, D.CostCenterCode, C.CostCenterName, D.Narration
              from WebSalesInvoiceDtl D
              inner join WebAccountHead H on H.Code = D.AccountHeadCode
              left join WebCostCenter C on C.Code = D.CostCenterCode
              where D.InvoiceHdrCode = @Code
              order by D.SlNo",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        // Only invoices with Outstanding > 0 for this customer - what a Receipt voucher's
        // "Received From" line can allocate a payment against.
        public DataTable GetOpenSalesInvoices(int customerCode, int branchCode) => _db.GetDataTableFromQuery(
            @"select X.Code, X.InvoiceNo, X.InvoiceDate, X.DueDate, X.TotalAmount, X.PaidAmount, (X.TotalAmount - X.PaidAmount) as Outstanding
              from (
                select H.Code, H.InvoiceNo, H.InvoiceDate, H.DueDate, H.TotalAmount,
                       ISNULL((select SUM(AllocatedAmount) from WebInvoiceAllocation A where A.InvoiceType = 'Sales' and A.InvoiceHdrCode = H.Code), 0) as PaidAmount
                from WebSalesInvoiceHdr H
                where H.CustomerCode = @CustomerCode and H.BranchCode = @BranchCode
              ) X
              where X.TotalAmount - X.PaidAmount > 0.001
              order by X.InvoiceDate, X.Code",
            new[]
            {
                SqlHelper.Param("@CustomerCode", SqlDbType.Int, customerCode),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode)
            });

        // Posts Dr Customer (the Sundry Debtor) for the invoice total / Cr each Income line, through
        // the same SaveVoucher path every other voucher type uses (VoucherType "SalesInvoice") - so
        // Ledger/Trial Balance/Balance Sheet/P&L pick invoices up automatically with no report changes.
        public (string Result, int Code) SaveSalesInvoice(SalesInvoiceSaveRequest req, int userCode)
        {
            if (req.Lines.Count == 0 || req.Lines.Sum(l => l.Amount) <= 0)
                return ("Please add at least one line with an amount.", 0);

            var total = req.Lines.Sum(l => l.Amount);

            int existingVoucherCode = 0;
            if (req.Code > 0)
            {
                var hdrDt = _db.GetDataTableFromQuery(
                    "select VoucherHdrCode from WebSalesInvoiceHdr where Code = @Code",
                    new[] { SqlHelper.Param("@Code", SqlDbType.Int, req.Code) });
                if (hdrDt.Rows.Count > 0 && hdrDt.Rows[0]["VoucherHdrCode"] != DBNull.Value)
                    existingVoucherCode = Convert.ToInt32(hdrDt.Rows[0]["VoucherHdrCode"]);
            }

            var voucherLines = new List<VoucherLineRow>
            {
                new VoucherLineRow { SlNo = 1, AccountHeadCode = req.CustomerCode, DebitAmount = total, CreditAmount = 0 }
            };
            var slNo = 2;
            foreach (var line in req.Lines)
                voucherLines.Add(new VoucherLineRow { SlNo = slNo++, AccountHeadCode = line.AccountHeadCode, DebitAmount = 0, CreditAmount = line.Amount, CostCenterCode = line.CostCenterCode, Narration = line.Narration });

            var (voucherResult, voucherCode) = SaveVoucher(new VoucherSaveRequest
            {
                Code = existingVoucherCode,
                VoucherNo = req.InvoiceNo,
                VoucherDate = req.InvoiceDate,
                VoucherType = "SalesInvoice",
                Narration = req.Narration,
                BranchCode = req.BranchCode,
                Lines = voucherLines
            }, userCode);
            if (voucherCode == 0) return (voucherResult, 0);

            int code;
            var hdrParams = new[]
            {
                SqlHelper.Param("@InvoiceNo", SqlDbType.VarChar, req.InvoiceNo ?? "", 30),
                SqlHelper.Param("@InvoiceDate", SqlDbType.Date, req.InvoiceDate),
                SqlHelper.Param("@DueDate", SqlDbType.Date, (object?)req.DueDate ?? DBNull.Value),
                SqlHelper.Param("@CustomerCode", SqlDbType.Int, req.CustomerCode),
                SqlHelper.Param("@Narration", SqlDbType.VarChar, req.Narration ?? "", 300),
                SqlHelper.Param("@TotalAmount", SqlDbType.Decimal, total),
                SqlHelper.Param("@VoucherHdrCode", SqlDbType.Int, voucherCode),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
            };
            if (req.Code > 0)
            {
                code = req.Code;
                _db.ExecuteNonQuery(
                    @"update WebSalesInvoiceHdr set
                        InvoiceNo=@InvoiceNo, InvoiceDate=@InvoiceDate, DueDate=@DueDate, CustomerCode=@CustomerCode,
                        Narration=@Narration, TotalAmount=@TotalAmount, VoucherHdrCode=@VoucherHdrCode,
                        UpdatedBy=@UserCode, UpdatedAt=GETDATE()
                      where Code=@Code",
                    hdrParams.Append(SqlHelper.Param("@Code", SqlDbType.Int, code)).ToArray());
            }
            else
            {
                var dt = _db.GetDataTableFromQuery(
                    @"insert into WebSalesInvoiceHdr (InvoiceNo, InvoiceDate, DueDate, CustomerCode, BranchCode, Narration, TotalAmount, VoucherHdrCode, CreatedBy)
                      output inserted.Code
                      values (@InvoiceNo, @InvoiceDate, @DueDate, @CustomerCode, @BranchCode, @Narration, @TotalAmount, @VoucherHdrCode, @UserCode)",
                    hdrParams.Append(SqlHelper.Param("@BranchCode", SqlDbType.Int, req.BranchCode)).ToArray());
                code = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["Code"]) : 0;
            }

            _db.ExecuteNonQuery("delete from WebSalesInvoiceDtl where InvoiceHdrCode = @Code", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            foreach (var line in req.Lines)
            {
                _db.ExecuteNonQuery(
                    @"insert into WebSalesInvoiceDtl (InvoiceHdrCode, SlNo, AccountHeadCode, Amount, CostCenterCode, Narration)
                      values (@InvoiceHdrCode, @SlNo, @AccountHeadCode, @Amount, @CostCenterCode, @Narration)",
                    new[]
                    {
                        SqlHelper.Param("@InvoiceHdrCode", SqlDbType.Int, code),
                        SqlHelper.Param("@SlNo", SqlDbType.Int, line.SlNo),
                        SqlHelper.Param("@AccountHeadCode", SqlDbType.Int, line.AccountHeadCode),
                        SqlHelper.Param("@Amount", SqlDbType.Decimal, line.Amount),
                        SqlHelper.Param("@CostCenterCode", SqlDbType.Int, line.CostCenterCode),
                        SqlHelper.Param("@Narration", SqlDbType.VarChar, line.Narration ?? "", 300)
                    });
            }

            if (req.Code > 0) _audit.LogEdit("Accounts - Sales Invoice", $"{req.InvoiceNo} - Sales Invoice Edited", req.BranchCode);
            else _audit.LogAdd("Accounts - Sales Invoice", $"{req.InvoiceNo} - Sales Invoice Added", req.BranchCode);

            return (req.Code > 0 ? "Updated Successfully" : "Saved Successfully", code);
        }

        public void DeleteSalesInvoice(int code)
        {
            var hdrDt = _db.GetDataTableFromQuery(
                "select VoucherHdrCode from WebSalesInvoiceHdr where Code = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            var voucherCode = hdrDt.Rows.Count > 0 && hdrDt.Rows[0]["VoucherHdrCode"] != DBNull.Value
                ? Convert.ToInt32(hdrDt.Rows[0]["VoucherHdrCode"]) : 0;

            _db.ExecuteNonQuery("delete from WebInvoiceAllocation where InvoiceType='Sales' and InvoiceHdrCode = @Code", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            _db.ExecuteNonQuery("delete from WebSalesInvoiceDtl where InvoiceHdrCode = @Code", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            _db.ExecuteNonQuery("delete from WebSalesInvoiceHdr where Code = @Code", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            if (voucherCode > 0) DeleteVoucher(voucherCode);
            _audit.LogDelete("Accounts - Sales Invoice", $"Sales Invoice Code {code} deleted");
        }

        // ---------- Purchase Invoices ----------

        public DataTable GetPurchaseInvoiceList(int branchCode) => _db.GetDataTableFromQuery(
            @"select H.Code, H.InvoiceNo, H.InvoiceDate, H.DueDate, H.SupplierCode, S.HeadName as SupplierName, H.TotalAmount, H.Narration,
                     ISNULL((select SUM(AllocatedAmount) from WebInvoiceAllocation A where A.InvoiceType = 'Purchase' and A.InvoiceHdrCode = H.Code), 0) as PaidAmount
              from WebPurchaseInvoiceHdr H
              inner join WebAccountHead S on S.Code = H.SupplierCode
              where H.BranchCode = @BranchCode
              order by H.InvoiceDate desc, H.Code desc",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });

        public DataTable GetPurchaseInvoiceHeader(int code) => _db.GetDataTableFromQuery(
            "select * from WebPurchaseInvoiceHdr where Code = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public DataTable GetPurchaseInvoiceLines(int code) => _db.GetDataTableFromQuery(
            @"select D.Code, D.SlNo, D.AccountHeadCode, H.HeadName, D.Amount, D.CostCenterCode, C.CostCenterName, D.Narration
              from WebPurchaseInvoiceDtl D
              inner join WebAccountHead H on H.Code = D.AccountHeadCode
              left join WebCostCenter C on C.Code = D.CostCenterCode
              where D.InvoiceHdrCode = @Code
              order by D.SlNo",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        // Only invoices with Outstanding > 0 for this supplier - what a Payment voucher's "Paid To"
        // line can allocate a payment against.
        // Sourced from the desktop's own real Purchase Invoice records (purchasePurchaseInvoiceHdr),
        // not the new independent WebPurchaseInvoiceHdr - the desktop already has thousands of real
        // bills with real outstanding balances, and re-entering that history into the new web-only
        // table isn't realistic. Read-only: never writes to purchasePurchaseInvoiceHdr or its
        // PaidAmount column - a payment made here instead records its own allocation in
        // WebInvoiceAllocation (InvoiceType 'DesktopPurchase'), subtracted from the desktop's own
        // PaidAmount here so the outstanding total stays correct without ever touching desktop data.
        // excludeVoucherCode: when reopening an existing Payment for editing, that voucher's own
        // allocations must not count against "already paid" - otherwise an invoice it fully settled
        // would show zero outstanding and vanish from the list, instead of reappearing pre-ticked
        // exactly as it was when originally selected. Pass 0 for a new voucher (never matches a
        // real VoucherHdrCode, so nothing is excluded).
        public DataTable GetOpenPurchaseInvoices(int supplierCode, int branchCode, int excludeVoucherCode = 0) => _db.GetDataTableFromQuery(
            @"select X.Code, X.InvoiceNo, X.InvoiceDate, X.DueDate, X.TotalAmount, X.PaidAmount, (X.TotalAmount - X.PaidAmount) as Outstanding
              from (
                select H.PurchaseInvoiceCode as Code, H.PurchaseInvoiceNo as InvoiceNo, H.PInvDate as InvoiceDate, H.DueDate,
                       H.FinalAmount as TotalAmount,
                       (ISNULL(H.PaidAmount, 0)
                         + ISNULL((select SUM(AllocatedAmount) from WebInvoiceAllocation A
                                   where A.InvoiceType = 'DesktopPurchase' and A.InvoiceHdrCode = H.PurchaseInvoiceCode
                                     and A.VoucherHdrCode <> @ExcludeVoucherCode), 0)) as PaidAmount
                from purchasePurchaseInvoiceHdr H
                where H.SupplierCode = @SupplierCode and H.BranchCode = @BranchCode and H.ActiveYesNo = 'Y'
              ) X
              where X.TotalAmount - X.PaidAmount > 0.001
              order by X.InvoiceDate, X.Code",
            new[]
            {
                SqlHelper.Param("@SupplierCode", SqlDbType.Int, supplierCode),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@ExcludeVoucherCode", SqlDbType.Int, excludeVoucherCode)
            });

        // Posts Dr each Expense line / Cr Supplier (the Sundry Creditor) for the invoice total -
        // mirror image of SaveSalesInvoice, same VoucherType-tagged path ("PurchaseInvoice").
        public (string Result, int Code) SavePurchaseInvoice(PurchaseInvoiceSaveRequest req, int userCode)
        {
            if (req.Lines.Count == 0 || req.Lines.Sum(l => l.Amount) <= 0)
                return ("Please add at least one line with an amount.", 0);

            var total = req.Lines.Sum(l => l.Amount);

            int existingVoucherCode = 0;
            if (req.Code > 0)
            {
                var hdrDt = _db.GetDataTableFromQuery(
                    "select VoucherHdrCode from WebPurchaseInvoiceHdr where Code = @Code",
                    new[] { SqlHelper.Param("@Code", SqlDbType.Int, req.Code) });
                if (hdrDt.Rows.Count > 0 && hdrDt.Rows[0]["VoucherHdrCode"] != DBNull.Value)
                    existingVoucherCode = Convert.ToInt32(hdrDt.Rows[0]["VoucherHdrCode"]);
            }

            var voucherLines = new List<VoucherLineRow>();
            var slNo = 1;
            foreach (var line in req.Lines)
                voucherLines.Add(new VoucherLineRow { SlNo = slNo++, AccountHeadCode = line.AccountHeadCode, DebitAmount = line.Amount, CreditAmount = 0, CostCenterCode = line.CostCenterCode, Narration = line.Narration });
            voucherLines.Add(new VoucherLineRow { SlNo = slNo, AccountHeadCode = req.SupplierCode, DebitAmount = 0, CreditAmount = total });

            var (voucherResult, voucherCode) = SaveVoucher(new VoucherSaveRequest
            {
                Code = existingVoucherCode,
                VoucherNo = req.InvoiceNo,
                VoucherDate = req.InvoiceDate,
                VoucherType = "PurchaseInvoice",
                Narration = req.Narration,
                BranchCode = req.BranchCode,
                Lines = voucherLines
            }, userCode);
            if (voucherCode == 0) return (voucherResult, 0);

            int code;
            var hdrParams = new[]
            {
                SqlHelper.Param("@InvoiceNo", SqlDbType.VarChar, req.InvoiceNo ?? "", 30),
                SqlHelper.Param("@InvoiceDate", SqlDbType.Date, req.InvoiceDate),
                SqlHelper.Param("@DueDate", SqlDbType.Date, (object?)req.DueDate ?? DBNull.Value),
                SqlHelper.Param("@SupplierCode", SqlDbType.Int, req.SupplierCode),
                SqlHelper.Param("@Narration", SqlDbType.VarChar, req.Narration ?? "", 300),
                SqlHelper.Param("@TotalAmount", SqlDbType.Decimal, total),
                SqlHelper.Param("@VoucherHdrCode", SqlDbType.Int, voucherCode),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
            };
            if (req.Code > 0)
            {
                code = req.Code;
                _db.ExecuteNonQuery(
                    @"update WebPurchaseInvoiceHdr set
                        InvoiceNo=@InvoiceNo, InvoiceDate=@InvoiceDate, DueDate=@DueDate, SupplierCode=@SupplierCode,
                        Narration=@Narration, TotalAmount=@TotalAmount, VoucherHdrCode=@VoucherHdrCode,
                        UpdatedBy=@UserCode, UpdatedAt=GETDATE()
                      where Code=@Code",
                    hdrParams.Append(SqlHelper.Param("@Code", SqlDbType.Int, code)).ToArray());
            }
            else
            {
                var dt = _db.GetDataTableFromQuery(
                    @"insert into WebPurchaseInvoiceHdr (InvoiceNo, InvoiceDate, DueDate, SupplierCode, BranchCode, Narration, TotalAmount, VoucherHdrCode, CreatedBy)
                      output inserted.Code
                      values (@InvoiceNo, @InvoiceDate, @DueDate, @SupplierCode, @BranchCode, @Narration, @TotalAmount, @VoucherHdrCode, @UserCode)",
                    hdrParams.Append(SqlHelper.Param("@BranchCode", SqlDbType.Int, req.BranchCode)).ToArray());
                code = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["Code"]) : 0;
            }

            _db.ExecuteNonQuery("delete from WebPurchaseInvoiceDtl where InvoiceHdrCode = @Code", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            foreach (var line in req.Lines)
            {
                _db.ExecuteNonQuery(
                    @"insert into WebPurchaseInvoiceDtl (InvoiceHdrCode, SlNo, AccountHeadCode, Amount, CostCenterCode, Narration)
                      values (@InvoiceHdrCode, @SlNo, @AccountHeadCode, @Amount, @CostCenterCode, @Narration)",
                    new[]
                    {
                        SqlHelper.Param("@InvoiceHdrCode", SqlDbType.Int, code),
                        SqlHelper.Param("@SlNo", SqlDbType.Int, line.SlNo),
                        SqlHelper.Param("@AccountHeadCode", SqlDbType.Int, line.AccountHeadCode),
                        SqlHelper.Param("@Amount", SqlDbType.Decimal, line.Amount),
                        SqlHelper.Param("@CostCenterCode", SqlDbType.Int, line.CostCenterCode),
                        SqlHelper.Param("@Narration", SqlDbType.VarChar, line.Narration ?? "", 300)
                    });
            }

            if (req.Code > 0) _audit.LogEdit("Accounts - Purchase Invoice", $"{req.InvoiceNo} - Purchase Invoice Edited", req.BranchCode);
            else _audit.LogAdd("Accounts - Purchase Invoice", $"{req.InvoiceNo} - Purchase Invoice Added", req.BranchCode);

            return (req.Code > 0 ? "Updated Successfully" : "Saved Successfully", code);
        }

        public void DeletePurchaseInvoice(int code)
        {
            var hdrDt = _db.GetDataTableFromQuery(
                "select VoucherHdrCode from WebPurchaseInvoiceHdr where Code = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            var voucherCode = hdrDt.Rows.Count > 0 && hdrDt.Rows[0]["VoucherHdrCode"] != DBNull.Value
                ? Convert.ToInt32(hdrDt.Rows[0]["VoucherHdrCode"]) : 0;

            _db.ExecuteNonQuery("delete from WebInvoiceAllocation where InvoiceType='Purchase' and InvoiceHdrCode = @Code", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            _db.ExecuteNonQuery("delete from WebPurchaseInvoiceDtl where InvoiceHdrCode = @Code", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            _db.ExecuteNonQuery("delete from WebPurchaseInvoiceHdr where Code = @Code", new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            if (voucherCode > 0) DeleteVoucher(voucherCode);
            _audit.LogDelete("Accounts - Purchase Invoice", $"Purchase Invoice Code {code} deleted");
        }

        // ---------- Reports ----------

        // Opening balance as of FromDate = the Account Head's own Opening Balance (signed: Dr = +,
        // Cr = -) plus every voucher line posted before FromDate - then every line from FromDate to
        // ToDate is listed with a running balance built on top of that.
        public (decimal OpeningBalance, DataTable Lines) GetLedger(int accountHeadCode, DateTime fromDate, DateTime toDate)
        {
            var head = _db.GetDataTableFromQuery(
                "select OpeningBalance, OpeningBalanceType from WebAccountHead where Code = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, accountHeadCode) });
            decimal openingSigned = 0;
            if (head.Rows.Count > 0)
            {
                var bal = Convert.ToDecimal(head.Rows[0]["OpeningBalance"]);
                openingSigned = (head.Rows[0]["OpeningBalanceType"]?.ToString() == "Cr") ? -bal : bal;
            }

            var priorDt = _db.GetDataTableFromQuery(
                @"select ISNULL(SUM(DebitAmount - CreditAmount), 0) as PriorNet
                  from WebAccountVoucherDtl D
                  inner join WebAccountVoucherHdr H on H.Code = D.VoucherHdrCode
                  where D.AccountHeadCode = @Code and H.VoucherDate < @FromDate",
                new[]
                {
                    SqlHelper.Param("@Code", SqlDbType.Int, accountHeadCode),
                    SqlHelper.Param("@FromDate", SqlDbType.Date, fromDate.Date)
                });
            var priorNet = priorDt.Rows.Count > 0 ? Convert.ToDecimal(priorDt.Rows[0]["PriorNet"]) : 0;
            var openingBalance = openingSigned + priorNet;

            var lines = _db.GetDataTableFromQuery(
                @"select H.VoucherDate, H.VoucherNo, H.VoucherType, D.Narration, D.DebitAmount, D.CreditAmount
                  from WebAccountVoucherDtl D
                  inner join WebAccountVoucherHdr H on H.Code = D.VoucherHdrCode
                  where D.AccountHeadCode = @Code and H.VoucherDate >= @FromDate and H.VoucherDate <= @ToDate
                  order by H.VoucherDate, H.Code",
                new[]
                {
                    SqlHelper.Param("@Code", SqlDbType.Int, accountHeadCode),
                    SqlHelper.Param("@FromDate", SqlDbType.Date, fromDate.Date),
                    SqlHelper.Param("@ToDate", SqlDbType.Date, toDate.Date)
                });

            return (openingBalance, lines);
        }

        // Runs GetLedger once per selected Account Head so the report can show several ledgers
        // stacked together (each keeps its own opening/closing balance - there's no single combined
        // running balance across different ledgers, same as Tally's own multi-ledger display).
        public List<(int AccountHeadCode, string HeadName, decimal OpeningBalance, DataTable Lines)> GetLedgerMulti(
            List<int> accountHeadCodes, DateTime fromDate, DateTime toDate)
        {
            var result = new List<(int, string, decimal, DataTable)>();
            foreach (var code in accountHeadCodes)
            {
                var nameDt = _db.GetDataTableFromQuery(
                    "select HeadName from WebAccountHead where Code = @Code",
                    new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
                var headName = nameDt.Rows.Count > 0 ? nameDt.Rows[0]["HeadName"].ToString() ?? "" : "";
                var (opening, lines) = GetLedger(code, fromDate, toDate);
                result.Add((code, headName, opening, lines));
            }
            return result;
        }

        // One row per Account Head with its signed balance as of AsOfDate (Opening Balance + every
        // posting up to and including that date) - Dr/Cr resolved from the sign, grouped by Account
        // Group in the caller. Debits and Credits always total equal by construction, since every
        // saved voucher itself balances (see SaveVoucher).
        public DataTable GetTrialBalance(int branchCode, DateTime asOfDate) => _db.GetDataTableFromQuery(
            @"select H.Code, H.HeadName, G.GroupName, G.Nature,
                     (case when H.OpeningBalanceType = 'Cr' then -H.OpeningBalance else H.OpeningBalance end
                       + ISNULL((select SUM(D.DebitAmount - D.CreditAmount)
                                 from WebAccountVoucherDtl D
                                 inner join WebAccountVoucherHdr VH on VH.Code = D.VoucherHdrCode
                                 where D.AccountHeadCode = H.Code and VH.VoucherDate <= @AsOfDate), 0)) as Balance
              from WebAccountHead H
              inner join WebAccountGroup G on G.Code = H.GroupCode
              where H.BranchCode = @BranchCode and H.IsActive = 1
              order by G.GroupName, H.HeadName",
            new[]
            {
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@AsOfDate", SqlDbType.Date, asOfDate.Date)
            });

        // Same balance calculation as Trial Balance, but only for Asset/Liability/Equity-nature
        // groups (Balance Sheet accounts) - Income/Expense accounts belong on the P&L instead.
        public DataTable GetBalanceSheet(int branchCode, DateTime asOfDate) => _db.GetDataTableFromQuery(
            @"select H.Code, H.HeadName, G.GroupName, G.Nature,
                     (case when H.OpeningBalanceType = 'Cr' then -H.OpeningBalance else H.OpeningBalance end
                       + ISNULL((select SUM(D.DebitAmount - D.CreditAmount)
                                 from WebAccountVoucherDtl D
                                 inner join WebAccountVoucherHdr VH on VH.Code = D.VoucherHdrCode
                                 where D.AccountHeadCode = H.Code and VH.VoucherDate <= @AsOfDate), 0)) as Balance
              from WebAccountHead H
              inner join WebAccountGroup G on G.Code = H.GroupCode
              where H.BranchCode = @BranchCode and H.IsActive = 1 and G.Nature in ('Asset','Liability','Equity')
              order by G.Nature, G.GroupName, H.HeadName",
            new[]
            {
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@AsOfDate", SqlDbType.Date, asOfDate.Date)
            });

        // Income/Expense accounts' NET MOVEMENT strictly within the period (not a running balance
        // from account inception like Trial Balance/Balance Sheet use) - a P&L always reports one
        // period's activity, e.g. this month's Sales, not Sales since the account was opened.
        public DataTable GetProfitAndLoss(int branchCode, DateTime fromDate, DateTime toDate) => _db.GetDataTableFromQuery(
            @"select H.Code, H.HeadName, G.GroupName, G.Nature,
                     ISNULL((select SUM(D.CreditAmount - D.DebitAmount)
                             from WebAccountVoucherDtl D
                             inner join WebAccountVoucherHdr VH on VH.Code = D.VoucherHdrCode
                             where D.AccountHeadCode = H.Code and VH.VoucherDate >= @FromDate and VH.VoucherDate <= @ToDate), 0) as NetAmount
              from WebAccountHead H
              inner join WebAccountGroup G on G.Code = H.GroupCode
              where H.BranchCode = @BranchCode and H.IsActive = 1 and G.Nature in ('Income','Expense')
              order by G.Nature, G.GroupName, H.HeadName",
            new[]
            {
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@FromDate", SqlDbType.Date, fromDate.Date),
                SqlHelper.Param("@ToDate", SqlDbType.Date, toDate.Date)
            });

        private static SqlParameter[] BuildParams(AccountHeadSaveRequest req, int userCode, bool includeCode)
        {
            var list = new List<SqlParameter>
            {
                SqlHelper.Param("@HeadName", SqlDbType.VarChar, req.HeadName ?? "", 200),
                SqlHelper.Param("@GroupCode", SqlDbType.Int, req.GroupCode),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, req.BranchCode),
                SqlHelper.Param("@OpeningBalance", SqlDbType.Decimal, req.OpeningBalance),
                SqlHelper.Param("@OpeningBalanceType", SqlDbType.Char, req.OpeningBalanceType ?? "Dr", 2),
                SqlHelper.Param("@Remarks", SqlDbType.VarChar, req.Remarks ?? "", 300),
                SqlHelper.Param("@IsActive", SqlDbType.Bit, req.IsActive),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
            };
            if (includeCode) list.Add(SqlHelper.Param("@Code", SqlDbType.Int, req.Code));
            return list.ToArray();
        }
    }
}
