namespace StimesErp.Api.Models
{
    // Independent, web-only Accounts module - all-new WebAccountGroup/WebAccountHead/(vouchers
    // to follow) tables, never reading or writing the desktop's own 57-table accounting schema
    // (accountAccountHead, accountJournalBookHdr, etc.) or Tally. WebAccountGroup is seeded once
    // with Tally's own standard Primary Group structure (universal accounting groupings, not
    // proprietary) - see the seed script - and is not itself editable from this API.
    public class AccountHeadSaveRequest
    {
        public int Code { get; set; } // 0 = new
        public string HeadName { get; set; } = string.Empty;
        public int GroupCode { get; set; }
        public int BranchCode { get; set; }
        public decimal OpeningBalance { get; set; }

        /// <summary>"Dr" or "Cr".</summary>
        public string OpeningBalanceType { get; set; } = "Dr";
        public string? Remarks { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class VoucherSaveRequest
    {
        public int Code { get; set; } // 0 = new
        public string VoucherNo { get; set; } = string.Empty;
        public DateTime VoucherDate { get; set; }

        /// <summary>"Journal", "Payment", "Receipt", or "Contra".</summary>
        public string VoucherType { get; set; } = "Journal";
        public string? Narration { get; set; }

        /// <summary>Journal Entry only - the header-level "Ref No" field, matching the desktop's
        /// own Journal.xaml layout (Date / Ref No / Claim Date on its second row).</summary>
        public string? RefNo { get; set; }

        /// <summary>Petty Cash / Employee Payment / Petty Cash Payment only - "Direct" or
        /// "Request".</summary>
        public string? PettyCashMode { get; set; }
        public int BranchCode { get; set; }
        public List<VoucherLineRow> Lines { get; set; } = new();

        /// <summary>Payment/Receipt only - which open Purchase/Sales Invoices this voucher pays against.</summary>
        public List<InvoiceAllocationRow> Allocations { get; set; } = new();

        /// <summary>Payment/Receipt only - "Cash", "Bank", or "Cheque".</summary>
        public string? PaymentMethod { get; set; }
        public string? ChequeNo { get; set; }
        public DateTime? ChequeDate { get; set; }

        public List<VoucherDocumentRow> Documents { get; set; } = new();
    }

    public class VoucherDocumentRow
    {
        public int SlNo { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
    }

    public class InvoiceAllocationRow
    {
        /// <summary>"Sales" or "Purchase".</summary>
        public string InvoiceType { get; set; } = string.Empty;
        public int InvoiceHdrCode { get; set; }
        public decimal AllocatedAmount { get; set; }
    }

    public class VoucherLineRow
    {
        public int SlNo { get; set; }
        public int AccountHeadCode { get; set; }
        public decimal DebitAmount { get; set; }
        public decimal CreditAmount { get; set; }
        public string? Narration { get; set; }
        public int? CostCenterCode { get; set; }

        /// <summary>Journal Entry only - matches the desktop Journal.xaml grid's own "InvoiceNo"
        /// and "Project" (SiteCode/JobNoAutoGen) columns.</summary>
        public string? ReferenceNo { get; set; }
        public int? ProjectSoCode { get; set; }

        /// <summary>Petty Cash / Employee Payment / Petty Cash Payment only - per-line VAT and
        /// Supplier, its own Date (the actual expense/receipt date, which can differ from the
        /// voucher's own Date), a TRN No, and a single per-line attachment (unlike every other
        /// voucher's header-level Document Upload).</summary>
        public DateTime? LineDate { get; set; }
        public bool VatApplicable { get; set; }
        public decimal? VatAmount { get; set; }
        public int? SupplierCode { get; set; }
        public string? Trn { get; set; }
        public string? AttachmentPath { get; set; }
    }

    public class CostCenterSaveRequest
    {
        public int Code { get; set; } // 0 = new
        public string CostCenterName { get; set; } = string.Empty;
        public int BranchCode { get; set; }
        public bool IsActive { get; set; } = true;
    }

    // Sent as a POST body rather than query-string params: "Select all" on the Ledger Report's
    // multi-select can put hundreds of Account Head codes in one request, which overflows a GET
    // URL's length limit (Kestrel's default MaxRequestLineSize is 8KB) and gets rejected outright.
    public class LedgerReportRequest
    {
        public List<int> AccountHeadCodes { get; set; } = new();
        public DateTime FromDate { get; set; }
        public DateTime ToDate { get; set; }
    }

    public class InvoiceLineRow
    {
        public int SlNo { get; set; }
        public int AccountHeadCode { get; set; }
        public decimal Amount { get; set; }
        public int? CostCenterCode { get; set; }
        public string? Narration { get; set; }
    }

    public class SalesInvoiceSaveRequest
    {
        public int Code { get; set; } // 0 = new
        public string InvoiceNo { get; set; } = string.Empty;
        public DateTime InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public int CustomerCode { get; set; }
        public int BranchCode { get; set; }
        public string? Narration { get; set; }
        public List<InvoiceLineRow> Lines { get; set; } = new();
    }

    public class PurchaseInvoiceSaveRequest
    {
        public int Code { get; set; } // 0 = new
        public string InvoiceNo { get; set; } = string.Empty;
        public DateTime InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public int SupplierCode { get; set; }
        public int BranchCode { get; set; }
        public string? Narration { get; set; }
        public List<InvoiceLineRow> Lines { get; set; } = new();
    }
}
