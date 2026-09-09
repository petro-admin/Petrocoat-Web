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
        public DateTime? StartDate { get; set; }
        public DateTime? FinishDate { get; set; }
        public string Location { get; set; } = string.Empty;
        public string Project { get; set; } = string.Empty;
        public DateTime? StartTime { get; set; }
        public DateTime? CloseTime { get; set; }
        public int? Supervisor { get; set; }
        public int? PreparedBy { get; set; }
        public int? Engineer { get; set; }
        public string ScopeOfWorkCode { get; set; } = string.Empty;

        // Column names below were read directly off the WPF grid's DataMemberBinding
        // in DailySite.xaml (gvScopeOfWork / gvMaterial / gvConsumbales / gvMachineries).
        // Still verify them once against the real ERP_UDT_* user-defined table types in
        // SSMS (Database > Programmability > Types > User-Defined Table Types) before
        // going live - a mismatched column name/order will throw a SQL type error.
        public List<ScopeOfWorkRow> ScopeOfWork { get; set; } = new();
        public List<MaterialRow> Material { get; set; } = new();
        public List<EmployeeHourRow> ConsumablesAndMachineries { get; set; } = new();
        public List<ConsumableRow> Consumables { get; set; } = new();
        public List<MachineryRow> Machineries { get; set; } = new();
        public List<ConsumableRow> ConsumablesDR { get; set; } = new();
        public List<BranchHrsRow> BranchHrs { get; set; } = new();

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
        public int EstimationCode { get; set; }

        public int EstSlNo { get; set; }
        public string Scope { get; set; } = string.Empty;
        public int Division { get; set; }
    }

    // Matches gvMaterial columns in DailySite.xaml
    public class MaterialRow
    {
        public int SlNo { get; set; }
        public int MaterialCode { get; set; }
        public string PackSize { get; set; } = string.Empty;
        public string Unit { get; set; } = string.Empty;
        public decimal TotalMaterialEstimatedQty { get; set; }
        public decimal ReceivedQty { get; set; }
        public decimal MaterialReceivedTodayAtSite { get; set; }
        public decimal TodayConsumed { get; set; }
        public decimal BalanceAtSite { get; set; }
        public decimal Area { get; set; }
        public decimal RateOfApplication { get; set; }
        public decimal AreaSupposedToCover { get; set; }
        public decimal TodayMaterialsUsed { get; set; }
        public decimal BalanceMaterials { get; set; }
        public string Remarks { get; set; } = string.Empty;
        public string BgColor { get; set; } = string.Empty;
        public int? BaseUnitCode { get; set; }
    }

    // gvConsumbalesAndMachineries / employee hours — ERP_UDT_DailySiteConsumablesAndMachineriesNew
    public class EmployeeHourRow
    {
        public int SlNo { get; set; }
        public int EmployeeCode { get; set; }
        public decimal Hrs { get; set; }
        public decimal Idle { get; set; }
        public decimal Transport { get; set; }
        public decimal Basic { get; set; }
        public decimal OT1 { get; set; }
        public decimal OT2 { get; set; }
        public decimal TotalHrs { get; set; }
        public decimal NormalHrs { get; set; }
        public int BranchCode { get; set; }
    }

    // gvConsumbales / gvConsumbalesdirect — ERP_UDT_DailySiteConsumables
    public class ConsumableRow
    {
        public int SlNo { get; set; }
        public int ConsumableCode { get; set; }
        public decimal Quantity { get; set; }
        public decimal UsedToday { get; set; }
        public decimal TotalConsumablesUsed { get; set; }
        public string BgColor { get; set; } = string.Empty;
        public int? BaseUnitCode { get; set; }

    }

    // gvMachineries — ERP_UDT_DailySiteMachineries
    public class MachineryRow
    {
        public int SlNo { get; set; }
        public int ToolsAndEquipmentCode { get; set; }
        public decimal EstimatedQuantity { get; set; }
        public decimal AvailableToolsOrMachineryAtSite { get; set; }
        public decimal NoOfMachineUsedAtSite { get; set; }
        public decimal NoOfDaysUsedAtSite { get; set; }
        public decimal NoOfMachineryIdleAtSite { get; set; }
        public int StatusCode { get; set; }
        public string BgColor { get; set; } = string.Empty;

    }

    // gvBranchHrs — ERP_UDT_DailySiteBranchHrs
    public class BranchHrsRow
    {
        public int SlNo { get; set; }
        public int BranchCode { get; set; }
        public decimal TotalHrs { get; set; }
    }

    /// <summary>
    /// Everything DailySite.xaml.cs's gvConsumbalesAndMachineries_CellEditEnded looks up
    /// (payrollEmployeeInfo / payrollSettings Ramadan hours / payrollHolidayInfo /
    /// usp_GetEmployeeAlReadyExistInDailySite) to resolve an employee row's Basic hours
    /// and cross-site hour totals, bundled into one response.
    /// </summary>
    public class EmployeeHourContext
    {
        public bool EmployeeFound { get; set; }
        public int BranchCode { get; set; }
        public int CurrentDesigCode { get; set; }
        public decimal NormalHoursPerDay { get; set; }
        public bool IsRamadan { get; set; }
        public decimal RamadanHrs { get; set; }
        public bool IsHoliday { get; set; }
        public bool AlreadyExistsElsewhere { get; set; }
        public decimal ExistingHrs { get; set; }
        public decimal ExistingNormalHrs { get; set; }
        public string ExistingDailySiteNo { get; set; } = string.Empty;
    }

    /// <summary>
    /// Web equivalent of gvScopeOfWork_CellEditEnded's usp_GetDailySiteSOWiseScopeOfWork call -
    /// cross-site totals for the same Job/SurfacePreparation/SpecialRequirement combination.
    /// </summary>
    public class ScopeOfWorkContext
    {
        public decimal TotalAreaCompleted { get; set; }
        public decimal AchievedRateForEachActivity { get; set; }
        public decimal BalanceToComplete { get; set; }
        public int Cnt { get; set; } = 1;
    }

    /// <summary>
    /// Web equivalent of gvMaterial_CellEditEnded's usp_GetDailySiteSOWisePreviousMaterialDtl call -
    /// summed across every returned row, same as the desktop's dsSideGrid.AsEnumerable().Sum(...).
    /// </summary>
    public class MaterialPreviousContext
    {
        public decimal BalanceMaterialsPrev { get; set; }
        public decimal EstRateOfUsage { get; set; } = 1;
        public decimal TotalMaterialsUsedPrev { get; set; }
        public decimal MaterialReceivedTodayAtSitePrev { get; set; }
    }

    /// <summary>
    /// Web equivalent of gvConsumbales_CellEditEnded's usp_GetDailySiteSOWisePreviousConsumableDtl call -
    /// only the first returned row is used, matching the desktop's dt.Rows[0] access.
    /// </summary>
    public class ConsumablePreviousContext
    {
        public decimal TotalConsumablesUsedPrev { get; set; }
        public decimal TotalQty { get; set; }
    }
}
