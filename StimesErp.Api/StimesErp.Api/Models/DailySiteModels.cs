namespace StimesErp.Api.Models
{
    public class DailySiteSaveRequest
    {
        public int DailySiteCode { get; set; }          // 0 = new
        public string DocNo { get; set; } = string.Empty;
        public string DocNoRev { get; set; } = string.Empty;
        public DateTime DocDate { get; set; }
        public int ClientCode { get; set; }
        public int JobCode { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime FinishDate { get; set; }
        public string Location { get; set; } = string.Empty;
        public string Project { get; set; } = string.Empty;
        public DateTime StartTime { get; set; }
        public DateTime CloseTime { get; set; }
        public int Supervisor { get; set; }
        public int PreparedBy { get; set; }
        public int Engineer { get; set; }
        public string ScopeOfWorkCode { get; set; } = string.Empty;

        // Column names below were read directly off the WPF grid's DataMemberBinding
        // in DailySite.xaml (gvScopeOfWork / gvMaterial / gvConsumbales / gvMachineries).
        // Still verify them once against the real ERP_UDT_* user-defined table types in
        // SSMS (Database > Programmability > Types > User-Defined Table Types) before
        // going live - a mismatched column name/order will throw a SQL type error.
        public List<ScopeOfWorkRow> ScopeOfWork { get; set; } = new();
        public List<MaterialRow> Material { get; set; } = new();
        public List<ConsumableMachineryRow> ConsumablesAndMachineries { get; set; } = new();
        public List<ConsumableMachineryRow> Consumables { get; set; } = new();
        public List<ConsumableMachineryRow> Machineries { get; set; } = new();
        public List<ConsumableMachineryRow> ConsumablesDR { get; set; } = new();
        public List<Dictionary<string, object>> BranchHrs { get; set; } = new();

        public decimal ScopeManhours { get; set; }
        public decimal TodayManhours { get; set; }
        public decimal PreviousManhours { get; set; }
        public decimal GrandTotalManhours { get; set; }
        public decimal BalanceManhours { get; set; }
        public decimal TodayManhoursPerc { get; set; }
        public decimal PreviousManhoursPerc { get; set; }
        public decimal GrandTotalManhoursPerc { get; set; }
        public decimal BalanceManhoursPerc { get; set; }
        public decimal ExcessPerc { get; set; }

        public string Excess { get; set; } = string.Empty;
        public string Remarks { get; set; } = string.Empty;
        public string MinHrs { get; set; } = string.Empty;
        public string WithoutMaterial { get; set; } = string.Empty;
        public int ExsistSoCode { get; set; }

        public int Mode { get; set; } // 0 = insert, 1 = update, 2 = delete (matches desktop app hdnMode)
    }

    // Matches gvScopeOfWork columns in DailySite.xaml
    public class ScopeOfWorkRow
    {
        public int SlNo { get; set; }
        public int SurfacePreparationCode { get; set; }
        public string SpecialRequirement { get; set; } = string.Empty;
        public int UnitCode { get; set; }
        public decimal ScopeOfWorkAsPerJobCard { get; set; }
        public decimal AreaCompleted { get; set; }
        public decimal ManhourEngaged { get; set; }
        public decimal AchievedRate { get; set; }
        public decimal AchievedRateForEachActivity { get; set; }
        public decimal TotalAreaCompleted { get; set; }
        public decimal BalanceToComplete { get; set; }
    }

    // Matches gvMaterial columns in DailySite.xaml
    public class MaterialRow
    {
        public int SlNo { get; set; }
        public int MaterialCode { get; set; }
        public string PackSize { get; set; } = string.Empty;
        public string Unit { get; set; } = string.Empty;
        public decimal TotalMaterialEstimatedQty { get; set; }
        public decimal MaterialReceivedTodayAtSite { get; set; }
        public decimal TodayConsumed { get; set; }
        public decimal BalanceAtSite { get; set; }
        public decimal Area { get; set; }
        public decimal RateOfApplication { get; set; }
        public decimal AreaSupposedToCover { get; set; }
        public decimal TodayMaterialsUsed { get; set; }
        public decimal BalanceMaterials { get; set; }
        public string Remarks { get; set; } = string.Empty;
    }

    // Shared shape for Consumables and Machineries rows (gvConsumbales / gvMachineries).
    // Machineries uses the Machinery-specific fields, Consumables uses Consumable-specific
    // ones - unused fields are simply left at default for the row's type.
    public class ConsumableMachineryRow
    {
        public int SlNo { get; set; }
        // Consumables
        public int ConsumableCode { get; set; }
        public decimal Quantity { get; set; }
        public decimal UsedToday { get; set; }
        public decimal TotalConsumablesUsed { get; set; }
        // Machineries
        public int ToolsAndEquipmentCode { get; set; }
        public decimal EstimatedQuantity { get; set; }
        public decimal AvailableToolsOrMachineryAtSite { get; set; }
        public decimal NoOfMachineUsedAtSite { get; set; }
        public decimal NoOfDaysUsedAtSite { get; set; }
        public decimal NoOfMachineryIdleAtSite { get; set; }
        public int StatusCode { get; set; }
    }
}
