namespace StimesErp.Api.Models
{
    // A fresh, standalone module - not tied to the desktop app's own "Vehicle Repair" screen
    // or its VehicleRepair/VehicleRepairDtl/VehicleRepairDocuments tables. Only AdminVehicleInfo
    // is shared with the rest of the ERP, as the source for the Vehicle picker.
    public class VehicleServiceRepairSaveRequest
    {
        public int Code { get; set; } // 0 = new
        public string DocNo { get; set; } = string.Empty;
        public DateTime DocDate { get; set; }
        public int VehicleCode { get; set; }
        public int BranchCode { get; set; }
        public int DriverCode { get; set; }

        /// <summary>"REPAIR", "SERVICE", or "BOTH".</summary>
        public string ServiceType { get; set; } = "REPAIR";

        public decimal CurrentKM { get; set; }
        public decimal NextServiceKM { get; set; }
        public DateTime? ServiceDate { get; set; }
        public DateTime? NextServiceDueDate { get; set; }
        public string Remarks { get; set; } = string.Empty;
        public bool Active { get; set; } = true;

        /// <summary>1 = Open, 2 = Completed.</summary>
        public int StatusCode { get; set; } = 1;
        public DateTime? CompletedDate { get; set; }

        public decimal VatPercent { get; set; } = 5;
        public decimal VatAmount { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal NetAmount { get; set; }

        public List<VehicleServiceRepairDtlRow> Items { get; set; } = new();
        public List<VehicleServiceRepairDocumentRow> Documents { get; set; } = new();
    }

    public class VehicleServiceRepairDtlRow
    {
        public int SlNo { get; set; }
        public string Description { get; set; } = string.Empty;
        public decimal Qty { get; set; }
        public decimal Rate { get; set; }
        public decimal Amount { get; set; }

        /// <summary>Per-item VAT - each row prices its own VAT, there is no single document-level rate.</summary>
        public decimal VatPercent { get; set; } = 5;
        public decimal VatAmount { get; set; }

        /// <summary>1 = Open, 2 = Closed.</summary>
        public int StatusCode { get; set; } = 1;

        public string Remarks { get; set; } = string.Empty;

        /// <summary>Category (e.g. "Vehicle Sides") when this row came from the vehicle inspection
        /// checklist auto-fill - empty for a manually-added row. Used only to group the grid.</summary>
        public string? Parts { get; set; }
    }

    public class VehicleServiceRepairDocumentRow
    {
        public int SlNo { get; set; }
        public string Description { get; set; } = string.Empty;
        public string Remarks { get; set; } = string.Empty;

        /// <summary>Stored file name (as returned by the upload endpoint) - null/empty if no file attached.</summary>
        public string? DocUpload { get; set; }
    }
}
