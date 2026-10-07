using System.Data;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class LeaveApplicationService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        // usp_payroll_GetAvailableLeaveDays's @ModuleCode is a fixed constant unrelated to the
        // approval-workflow ModuleCode (205) - hard-coded the same way the desktop's
        // Employee.GetAvailableCLDays call hard-codes it.
        private const int LeaveBalanceModuleCode = 205;

        public LeaveApplicationService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public string GetNextDocNo()
        {
            var dt = _db.GetDataTableFromProcedure("usp_payroll_GetLeaveRequestReferenceNumber");
            return dt.Rows.Count > 0 ? dt.Rows[0][0]?.ToString() ?? "" : "";
        }

        public DataTable GetLeaveTypes() =>
            _db.GetDataTableFromProcedure("usp_GetAllLeaveType", new[] { SqlHelper.Param("@LeaveTypeCode", SqlDbType.Int, 0) });

        // usp_payroll_GetEmployeeLists with no search text returns every active employee plus
        // DesigName already joined in - one call covers both the Employee picker and the
        // read-only Designation auto-fill next to it (matches desktop's txtEmpID_SelectionChanged).
        public DataTable GetEmployees() => _db.GetDataTableFromProcedure("usp_payroll_GetEmployeeLists", new[]
        {
            SqlHelper.Param("@tnEmpCode", SqlDbType.Int, 0),
            SqlHelper.Param("@tcSearchtext", SqlDbType.VarChar, "", 500),
            SqlHelper.Param("@tcSearchCriteria", SqlDbType.VarChar, "", 500),
            SqlHelper.Param("@tcWorkSheet", SqlDbType.VarChar, "", 10),
            SqlHelper.Param("@tnBranchCode", SqlDbType.Int, 0)
        });

        public DataTable GetAvailableLeaveDays(int employeeCode, int requestTypeCode, DateTime asOnDate) =>
            _db.GetDataTableFromProcedure("usp_payroll_GetAvailableLeaveDays", new[]
            {
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                SqlHelper.Param("@RequestTypeCode", SqlDbType.Int, requestTypeCode),
                SqlHelper.Param("@ModuleCode", SqlDbType.Int, LeaveBalanceModuleCode),
                SqlHelper.Param("@AsOnDate", SqlDbType.Date, asOnDate.Date)
            });

        // usp_payroll_ValidateLeaverequestInfo - exact From/To date match against the employee's
        // other requests (mode 0 = add). Note: the SP's own edit-mode (mode<>0) branch always
        // excludes the current employee from the match, so it never actually blocks an edit -
        // that's the live production SP's behaviour, kept as-is for parity.
        public DataTable ValidateDates(int employeeCode, DateTime fromDate, DateTime toDate, int mode) =>
            _db.GetDataTableFromProcedure("usp_payroll_ValidateLeaverequestInfo", new[]
            {
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                SqlHelper.Param("@LRFromDate", SqlDbType.Date, fromDate.Date),
                SqlHelper.Param("@LRToDate", SqlDbType.Date, toDate.Date),
                SqlHelper.Param("@tnMode", SqlDbType.Int, mode)
            });

        // @year is the request's From-Date year's LAST TWO DIGITS (e.g. 2026 -> 26), matching
        // usp_GetPayroll_LeaveRequestDetails's own `right(Year(LR.FromDate),2) = @year` compare.
        // 0 = all years.
        public DataTable GetList(string formClassName, int yearLastTwoDigits) =>
            _db.GetDataTableFromProcedure("usp_GetPayroll_LeaveRequestDetails", new[]
            {
                SqlHelper.Param("@RequestID", SqlDbType.Int, 0),
                SqlHelper.Param("@RequestNo", SqlDbType.VarChar, "", 5000),
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, 0),
                SqlHelper.Param("@FormClassName", SqlDbType.VarChar, formClassName, 5000),
                SqlHelper.Param("@year", SqlDbType.Int, yearLastTwoDigits)
            });

        public DataTable GetById(string formClassName, int requestId) =>
            _db.GetDataTableFromProcedure("usp_GetPayroll_LeaveRequestDetails", new[]
            {
                SqlHelper.Param("@RequestID", SqlDbType.Int, requestId),
                SqlHelper.Param("@RequestNo", SqlDbType.VarChar, "", 5000),
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, 0),
                SqlHelper.Param("@FormClassName", SqlDbType.VarChar, formClassName, 5000),
                SqlHelper.Param("@year", SqlDbType.Int, 0)
            });

        // Same shared network-share convention as Vehicle Service/Repair's document upload
        // (payrollSettings.ServerPath per branch) - used for the Medical Certificate attachment.
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

        // usp_payroll_ManageLeaveRequestDetails - single multiplexed SP for Insert(0)/Update(1)/Delete(2),
        // same as the desktop app calls. @BranchCode is accepted but overwritten server-side (from the
        // employee's own branch on insert, from the existing row's branch on update) - passed through
        // anyway since the SP signature requires a value.
        public string Save(LeaveApplicationSaveRequest req, int mode, int currentUserCode, int periodId,
            int branchCode, int companyCode, string formClassName)
        {
            var p = new[]
            {
                SqlHelper.Param("@RequestID", SqlDbType.Int, req.RequestId),
                SqlHelper.Param("@RequestNo", SqlDbType.VarChar, req.RequestNo ?? "", 5000),
                SqlHelper.Param("@RequestTypeCode", SqlDbType.Int, req.RequestTypeCode),
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, req.EmployeeCode),
                SqlHelper.Param("@FromDate", SqlDbType.DateTime, req.FromDate?.Date),
                SqlHelper.Param("@ToDate", SqlDbType.DateTime, req.ToDate?.Date),
                SqlHelper.Param("@Remarks", SqlDbType.NVarChar, req.Remarks ?? ""),
                SqlHelper.Param("@CurrentUserCode", SqlDbType.Int, currentUserCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@CompanyCode", SqlDbType.Int, companyCode),
                SqlHelper.Param("@Mode", SqlDbType.Int, mode),
                SqlHelper.Param("@FormClassName", SqlDbType.VarChar, formClassName, 5000),
                SqlHelper.Param("@TotalLeaveDays", SqlDbType.Decimal, req.TotalLeaveDays),
                SqlHelper.Param("@PaidLeave", SqlDbType.Int, req.PaidLeave),
                SqlHelper.Param("@chkPaidLeave", SqlDbType.VarChar, req.PaidLeaveChecked ? "Y" : "N", 500),
                SqlHelper.Param("@Rejoin", SqlDbType.DateTime, req.Rejoin?.Date),
                SqlHelper.Param("@Path", SqlDbType.VarChar, req.Path ?? (object?)null),
                SqlHelper.Param("@Date", SqlDbType.DateTime, req.DocDate.Date),
                SqlHelper.Param("@HalfDay", SqlDbType.VarChar, req.HalfDay ? "Y" : "N", 8)
            };

            var result = _db.DataTransactionsByProcedure("usp_payroll_ManageLeaveRequestDetails", p);
            var narration = $"{req.RequestNo} - Leave Application";
            switch (mode)
            {
                case 0: _audit.LogAdd("Leave Application", $"{narration} Added", branchCode); break;
                case 2: _audit.LogDelete("Leave Application", $"{narration} Deleted", branchCode); break;
                default: _audit.LogEdit("Leave Application", $"{narration} Edited", branchCode); break;
            }
            return result;
        }
    }
}
