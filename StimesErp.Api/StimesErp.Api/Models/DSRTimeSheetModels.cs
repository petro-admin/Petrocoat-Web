namespace StimesErp.Api.Models
{
    // Exact port of the desktop's DSRDailyTimeSheet.xaml(.cs) - reads/writes the SAME real desktop
    // tables (DSRTimeSheetHdr/DSRTimeSheetDtl/DSRJobSummaryDtl) via the SAME stored procedures
    // (usp_LoadDSRTimeSheetDtl, usp_Manage_PayrollDSRTimeSheet, usp_getDSRTimeSheetHdr) - not a new
    // web-only schema. FormClassName used for rights/approval lookups is the desktop's own exact
    // class name ("Stimes.Erp.App.Win.Payroll_System.DSRDailyTimeSheet", ModuleCode 360), so
    // existing desktop rights/approval configuration applies unchanged.
    public class DSRTimeSheetSaveRequest
    {
        public int DSRCode { get; set; } // 0 = new
        public string DSRNumber { get; set; } = string.Empty;
        public DateTime DSRDate { get; set; }
        public string? Remarks { get; set; }
        public int PeriodId { get; set; }
        public int BranchCode { get; set; }
        public int CompanyCode { get; set; }
        public List<DSRTimeSheetLineRow> Lines { get; set; } = new();
        public List<DSRJobSummaryRow> JobSummary { get; set; } = new();
    }

    // Column order here matches UDT_DSRTimeSheetDtl exactly (TVP columns are matched positionally,
    // not by name - see DSRTimeSheetService.BuildLinesTable).
    public class DSRTimeSheetLineRow
    {
        public int SlNo { get; set; }
        public int EmployeeCode { get; set; }
        public string EmpFullName { get; set; } = string.Empty;
        public int AttStatusCode { get; set; }
        public decimal ActualHrs { get; set; }
        public decimal Basic { get; set; }
        public decimal OT1 { get; set; }
        public decimal OT2 { get; set; }
        public decimal Idle { get; set; }
        public string? Category { get; set; }
        public string? MultiActual { get; set; }
        public string? SOCode { get; set; }
        public string? SupervisorCode { get; set; }
        public string? Supervisor { get; set; }
        public string? SoNo { get; set; }
        public decimal Paid { get; set; }
    }

    // Column order here matches UDT_DSRJobSummaryDtl exactly.
    public class DSRJobSummaryRow
    {
        public int SlNo { get; set; }
        public string? SoNo { get; set; }
        public int SOCode { get; set; }
        public decimal ActualHrs { get; set; }
        public decimal Basic { get; set; }
        public decimal OT { get; set; }
        public decimal Paid { get; set; }
        public decimal Idle { get; set; }
    }
}
