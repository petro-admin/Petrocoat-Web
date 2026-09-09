namespace StimesErp.Api.Models
{
    /// <summary>
    /// Web equivalent of the fields StoreIndent.xaml.cs's SaveButton_Click/SavePRequisition
    /// passes to POPPrchsRequisition.ManageStoreIndent (usp_purchase_ManageStoreIndent).
    /// Only the controls that are actually visible in the live desktop form (Details tab,
    /// General/Project mode) are exposed here - the Employee/Designation/Supplier/RqnType/
    /// OtherDetails/RequestedStatus controls are permanently hidden in the desktop XAML, so
    /// they are sent with their desktop default values rather than modeled as real fields.
    /// </summary>
    public class StoreIndentSaveRequest
    {
        public int PReqnCode { get; set; } // 0 = new
        public string RequisitionNo { get; set; } = string.Empty;
        public string RequisitionDetails { get; set; } = string.Empty; // txtRqnDet / "Project Details"
        public DateTime RequisitionDate { get; set; }
        public string RefNo { get; set; } = string.Empty;
        public int SupplierCode { get; set; }
        public int JobCode { get; set; } // Sales Order (txtJobDet)
        public bool Active { get; set; } = true;
        public int CostId { get; set; }
        public int CreatedByECode { get; set; }
        public int CheckedByECode { get; set; }
        public int ApprovedByECode { get; set; }

        /// <summary>"PRO" (Project) or "GEN" (General) - rdbProject / rdbGeneral.</summary>
        public string RequisitionType { get; set; } = "GEN";

        /// <summary>"INH" (Inhouse) or "OTH" (Others) - rdbInhouse / rdbOthers.</summary>
        public string RequisitionSubType { get; set; } = "OTH";

        // Only meaningful when RequisitionSubType = "INH" (txtEmployee/txtDesignation/ddlRequestedStatus).
        public int EmployeeCode { get; set; }
        public string Designation { get; set; } = string.Empty;
        public int RequestedStatus { get; set; }

        public List<StoreIndentGeneralRow> General { get; set; } = new();
        public List<StoreIndentItemRow> Material { get; set; } = new();
        public List<StoreIndentItemRow> Consumable { get; set; } = new();
        public List<StoreIndentItemRow> TAE { get; set; } = new();
    }

    // gvGeneral columns - matches CreateblankRowGeneral() in StoreIndent.xaml.cs exactly.
    public class StoreIndentGeneralRow
    {
        public int SlNo { get; set; }
        public int TypeCode { get; set; } // 1 Material, 2 Consumable, 3 Tools & Equipment, 4 Services
        public int StatusCode { get; set; } // 1 New (free text item), 2 Exist (picked from master)
        public int ItemCode { get; set; }
        public string Description { get; set; } = string.Empty;
        public string DescriptionNew { get; set; } = string.Empty; // free-text item name when StatusCode = 1
        public int UnitCode { get; set; }
        public decimal StockQty { get; set; }
        public decimal RequestedQty { get; set; }
        public decimal IssuedQty { get; set; }
        public string Remarks { get; set; } = string.Empty;
    }

    // Shared shape for gvMaterials / gvConsumable / gvToolsAndEquipment (Project mode) -
    // same columns (Item/Uom/Available/Requested/Issued/Remarks) in all three grids.
    public class StoreIndentItemRow
    {
        public int SlNo { get; set; }
        public int ItemCode { get; set; } // ItemCode / ConsumableCode / ToolsAndEquipmentCode depending on grid
        public int UnitCode { get; set; }
        public decimal StockQty { get; set; }
        public decimal RequestedQty { get; set; }
        public decimal IssuedQty { get; set; }
        public string Remarks { get; set; } = string.Empty;
    }
}
