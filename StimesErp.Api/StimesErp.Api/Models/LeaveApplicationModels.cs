namespace StimesErp.Api.Models
{
    // Ported 1:1 from the desktop's LeaveApplicationForm.xaml.cs - same shared table
    // (Payroll_LeaveRequestDetails), same stored procedures, same FormClassName so the two apps'
    // records/approval workflow stay fully interchangeable. See usp_payroll_ManageLeaveRequestDetails.
    public class LeaveApplicationSaveRequest
    {
        public int RequestId { get; set; } // 0 = new
        public string RequestNo { get; set; } = string.Empty;
        public int RequestTypeCode { get; set; }
        public int EmployeeCode { get; set; }
        public DateTime DocDate { get; set; }
        public DateTime? FromDate { get; set; }
        public DateTime? ToDate { get; set; }
        public string Remarks { get; set; } = string.Empty;
        public decimal TotalLeaveDays { get; set; }
        public bool PaidLeaveChecked { get; set; }
        public int PaidLeave { get; set; }
        public DateTime? Rejoin { get; set; }
        public string? Path { get; set; }
        public bool HalfDay { get; set; }
    }
}
