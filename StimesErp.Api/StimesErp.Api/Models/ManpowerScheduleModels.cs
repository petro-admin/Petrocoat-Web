namespace StimesErp.Api.Models
{
    public class ManpowerScheduleDtlRow
    {
        public bool ChkYesNo { get; set; }
        public int SlNo { get; set; }
        public int JobCode { get; set; }
        public int CustomerCode { get; set; }
        public int EmployeeCode { get; set; }
        public int SupervisorCode { get; set; }
        public string? Material { get; set; }
        public string? Consumable { get; set; }
        public string? Machinery { get; set; }
        public int ShiftCode { get; set; }
        public int DriverCode { get; set; }
        public string? Remarks { get; set; }
        public int VehicleCode { get; set; }
        public int SourceCode { get; set; }
        public string? Description { get; set; }
    }

    public class ManpowerScheduleIdleEmpRow
    {
        public int SlNo { get; set; }
        public int EmployeeCode { get; set; }
        public int StatusCode { get; set; }
        public string? Remarks { get; set; }
    }

    public class ManpowerScheduleSaveRequest
    {
        public int Code { get; set; }
        public string DocNo { get; set; } = "";
        public DateTime DocDate { get; set; }
        public int Mode { get; set; } // 0 = insert, 1 = update, 2 = delete (matches desktop app's Mode param)
        public List<ManpowerScheduleDtlRow> Lines { get; set; } = new();
        public List<ManpowerScheduleIdleEmpRow> IdleEmployees { get; set; } = new();
    }

    // Shape shared by the "Add Employees" picker and the idle-employee re-check calls -
    // matches UDT_ManpowerScheduleDtlNew (the 15 UDT_ManpowerScheduleDtl columns plus JobNo/EmpFullName).
    public class ManpowerScheduleDtlNewRow : ManpowerScheduleDtlRow
    {
        public string? JobNo { get; set; }
        public string? EmpFullName { get; set; }
    }
}
