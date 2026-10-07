namespace StimesErp.Api.Models
{
    // Ported from the desktop's ResourceRetrurn.xaml.cs (note the source file's own typo in its
    // name) - returns Materials/Consumables/Tools&Equipment previously issued via a Production
    // Resource Issue (productionMaterialIssueHdr) back into warehouse stock, using the exact same
    // managematerialreturndetails SP desktop uses. General Services/Subcontract/TAE-Hire are new
    // additions (desktop never built real persistence for those three - see
    // MaterialReturnDtlGeneral/MaterialReturnDtlSubContract/MaterialReturnDtlTAEHire, all new
    // tables, plus 3 new TVP types appended to the end of managematerialreturndetails's
    // parameter list).
    public class ResourceReturnSaveRequest
    {
        public int MatReturnCode { get; set; } // 0 = new
        public int MatIssueCode { get; set; }
        public string MatReturnNo { get; set; } = string.Empty;
        public DateTime MatReturnDate { get; set; }
        public string ProjectDetails { get; set; } = string.Empty;
        public int CostId { get; set; }
        public int WarehouseCode { get; set; }

        public List<ResourceReturnMaterialRow> Materials { get; set; } = new();
        public List<ResourceReturnMaterialRow> Consumables { get; set; } = new();
        public List<ResourceReturnTaeRow> ToolsAndEquipment { get; set; } = new();
        public List<ResourceReturnServiceRow> GeneralServices { get; set; } = new();
        public List<ResourceReturnServiceRow> SubContract { get; set; } = new();
        public List<ResourceReturnTaeHireRow> ToolsAndEquipmentHire { get; set; } = new();
    }

    // Shared shape for both Materials (ItemCode) and Consumables (ConsumableCode) - the two UDTs
    // (ERPDB_UDT_ResourceReturnMaterial/Consumable) are structurally identical, TVP columns are
    // matched by ordinal position, so one row type covers both.
    public class ResourceReturnMaterialRow
    {
        public int SlNo { get; set; }
        public int Code { get; set; } // ItemCode or ConsumableCode
        public decimal StockQty { get; set; }
        public decimal EstQty { get; set; }
        public decimal AvailableQty { get; set; }
        public decimal OrderedQty { get; set; }
        public decimal IssuedQty { get; set; }
        public decimal ReturnedQty { get; set; }
        public decimal BalanceRequiredQty { get; set; }
        public int UnitCode { get; set; }
        public decimal Rate { get; set; }
        public decimal Amount { get; set; }
        public int SupplierCode { get; set; }
        public decimal BalanceQty { get; set; }
        public DateTime? ExpiryDate { get; set; }
    }

    public class ResourceReturnTaeRow
    {
        public int SlNo { get; set; }
        public int ToolsAndEquipmentCode { get; set; }
        public decimal StockQty { get; set; }
        public decimal Qty { get; set; }
        public int UnitCode { get; set; }
        public decimal NoOfDays { get; set; }
        public DateTime? IssuedDate { get; set; }
        public DateTime? ReturnDate { get; set; }
        public int ConditionOfMachine { get; set; }
        public string? Description { get; set; }
        public string? DocUpload { get; set; }
        public DateTime? ExpDate { get; set; }
        public decimal BalanceQty { get; set; }
        public decimal ReturnedQty { get; set; }
    }

    // Shared shape for General Services and Subcontract (new - both mirror
    // productionMaterialIssueDtlGeneralServices/SubContract's own shape).
    public class ResourceReturnServiceRow
    {
        public int SlNo { get; set; }
        public int Code { get; set; } // ItemCode
        public decimal StockQty { get; set; }
        public decimal Qty { get; set; }
        public decimal ReturnedQty { get; set; }
        public int UnitCode { get; set; }
        public decimal Rate { get; set; }
        public decimal Amount { get; set; }
        public int SupplierCode { get; set; }
        public string? Remarks { get; set; }
        public decimal BalanceQty { get; set; }
    }

    public class ResourceReturnTaeHireRow
    {
        public int SlNo { get; set; }
        public int ToolsAndEquipmentCode { get; set; }
        public decimal StockQty { get; set; }
        public decimal Qty { get; set; }
        public decimal ReturnedQty { get; set; }
        public int UnitCode { get; set; }
        public decimal NoOfDays { get; set; }
        public DateTime? IssuedDate { get; set; }
        public DateTime? ReturnDate { get; set; }
        public decimal Rate { get; set; }
        public decimal Amount { get; set; }
        public int SupplierCode { get; set; }
        public string? Description { get; set; }
        public string? DocUpload { get; set; }
        public DateTime? ExpDate { get; set; }
        public decimal BalanceQty { get; set; }
    }
}
