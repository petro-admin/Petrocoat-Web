using System.Data;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class DSRTimeSheetService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public DSRTimeSheetService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // Same SP the desktop's side list grid uses (usp_getDSRTimeSheetHdr).
        public DataTable GetList(int periodId, int monthCode = 0) => _db.GetDataTableFromProcedure(
            "usp_getDSRTimeSheetHdr",
            new[]
            {
                SqlHelper.Param("@DSRCode", SqlDbType.Int, 0),
                SqlHelper.Param("@MonthCode", SqlDbType.Int, monthCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId)
            });

        // Deliberately NOT the usp_getDSRTimeSheetHdr SP for a single-record lookup - that SP's
        // WHERE clause requires an exact PeriodId match with no "any period" fallback (unlike its
        // own MonthCode filter, which does have one), so fetching a record saved under a different
        // period than whatever is currently selected in Quick Settings would silently return zero
        // rows. Plain SQL here instead, scoped only by DSRCode, with the same joins the SP uses.
        public DataTable GetHeader(int dsrCode) => _db.GetDataTableFromQuery(
            @"select Hdr.*, Emp.EmpFullName as CreatedEmp, AB.BranchName, DATENAME(MONTH, Hdr.DSRDate) as Month
              from DSRTimeSheetHdr Hdr
              left join AdminUserMaster UM on UM.UserCode = Hdr.CreatedBy
              left join payrollEmployeeInfo Emp on Emp.EmployeeCode = UM.EmpCode
              left join AdminBranchInfo AB on AB.BranchCode = Hdr.BranchCode
              where Hdr.DSRCode = @DSRCode",
            new[] { SqlHelper.Param("@DSRCode", SqlDbType.Int, dsrCode) });

        // Same plain inline SQL the desktop's own "select existing record" path uses (not a SP) -
        // see DSRDailyTimeSheet.xaml.cs's side-grid SelectionChanged handler.
        public DataTable GetLines(int dsrCode) => _db.GetDataTableFromQuery(
            "select * from DSRTimeSheetDtl where DSRCode = @DSRCode order by SlNo",
            new[] { SqlHelper.Param("@DSRCode", SqlDbType.Int, dsrCode) });

        public DataTable GetJobSummary(int dsrCode) => _db.GetDataTableFromQuery(
            "select SlNo, SoNo, SOCode, ActualHrs, Basic, OT, Paid, IDLE as Idle from DSRJobSummaryDtl where DSRCode = @DSRCode order by SlNo",
            new[] { SqlHelper.Param("@DSRCode", SqlDbType.Int, dsrCode) });

        // The "Load" button - usp_LoadDSRTimeSheetDtl already returns Basic/OT1/OT2/IDLE/Paid fully
        // pre-calculated per employee for that date (pulled from Daily Site attendance, holidays,
        // vacations/rejoining records). The web UI only needs to (re)run the row-level calculation
        // itself (see RecalculateLine-equivalent on the frontend) when the user manually edits a row
        // afterwards - a freshly loaded row is already correct as-is.
        public DataTable LoadFromDailySite(DateTime date, int periodId, int branchCode) => _db.GetDataTableFromProcedure(
            "usp_LoadDSRTimeSheetDtl",
            new[]
            {
                SqlHelper.Param("@PDTSDate", SqlDbType.DateTime, date),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode)
            });

        // Same lookup table the desktop's Status dropdown/grid combo binds to (AttendenceStatus.GetAttendenceStatus).
        public DataTable GetAttendanceStatuses() => _db.GetDataTableFromProcedure("usp_GetAttendenceStatus");

        // Matches BTNUpdate_Click_1's own standard-hours resolution exactly: PC/PTS/GRAVITAS Labour
        // uses the branch's payrollSettings.RamadanHrs (defaults to 8 if null - despite the name,
        // this is used as the general standard-hours setting on this screen, not Ramadan-specific),
        // everything else (Drivers/SubContract) uses the employee's own NormalHoursPerDay.
        public decimal GetStandardHours(int employeeCode, int branchCode, string category)
        {
            if (category is "PC Labour" or "PTS Labour" or "GRAVITAS Labour")
            {
                var dt = _db.GetDataTableFromQuery(
                    "select isnull(RamadanHrs,8) as Hrs from payrollSettings where BranchCode = @BranchCode",
                    new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });
                return dt.Rows.Count > 0 ? Convert.ToDecimal(dt.Rows[0]["Hrs"]) : 8m;
            }
            else
            {
                var dt = _db.GetDataTableFromQuery(
                    "select isnull(NormalHoursPerDay,8) as Hrs from payrollEmployeeInfo where EmployeeCode = @EmployeeCode",
                    new[] { SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode) });
                return dt.Rows.Count > 0 ? Convert.ToDecimal(dt.Rows[0]["Hrs"]) : 8m;
            }
        }

        // Matches BTNUpdate_Click_1's own holiday check: Sunday OR a payrollHolidayInfo row for
        // this date (the desktop's own `dth.Rows.Count > 0` check is actually a no-op bug - COUNT(*)
        // always returns exactly one row - so its real behavior is "Sunday only"; this reproduces
        // the CORRECT intended check instead, since replicating a bug that silently ignores the
        // holiday calendar would be worse than the tiny, clearly-intended-behavior deviation).
        public bool IsHoliday(DateTime date, int branchCode)
        {
            if (date.DayOfWeek == DayOfWeek.Sunday) return true;
            var dt = _db.GetDataTableFromQuery(
                "select COUNT(*) as Cnt from payrollHolidayInfo where HolidayDate = @Date",
                new[] { SqlHelper.Param("@Date", SqlDbType.Date, date) });
            return dt.Rows.Count > 0 && Convert.ToInt32(dt.Rows[0]["Cnt"]) > 0;
        }

        // Preview only, matching what usp_Manage_PayrollDSRTimeSheet itself actually assigns on
        // insert (MAX(DSRCode)+1 from DSRTimeSheetHdr, zero-padded to 4 digits) - NOT the desktop's
        // own usp_TimesheetRefNoAutoGenerate helper, which (on the real desktop) queries the
        // unrelated PayrollDailyTimeSheetHdr table and is display-only regardless; the real number
        // is always reassigned by the save SP itself, so previewing from the correct source here is
        // more useful than replicating that mismatch.
        public string GenerateDocNo()
        {
            var dt = _db.GetDataTableFromQuery(
                @"select Case When ISNULL(MAX(DSRCode),0)+1 <10 then '000' when ISNULL(MAX(DSRCode),0)+1<100 then '00' when ISNULL(MAX(DSRCode),0)+1<1000 then '0' Else '' End
                         + CONVERT(varchar(max), ISNULL(MAX(DSRCode),0)+1) as DSRNumber
                  from DSRTimeSheetHdr");
            return dt.Rows.Count > 0 ? dt.Rows[0]["DSRNumber"]?.ToString() ?? "" : "";
        }

        // usp_Manage_PayrollDSRTimeSheet Mode 0 (insert) / 1 (update) - exact same SP, exact same
        // TVPs, as the desktop itself calls from Cls_Payroll_DailyTimeSheet.Manage_PayrollDSRTimeSheet.
        public (string Result, int DSRCode) Save(DSRTimeSheetSaveRequest req, int userCode)
        {
            var mode = req.DSRCode > 0 ? 1 : 0;
            var dsrTable = BuildLinesTable(req.Lines);
            var jobTable = BuildJobSummaryTable(req.JobSummary);

            var p = new[]
            {
                SqlHelper.Param("@DSRCode", SqlDbType.Int, req.DSRCode),
                SqlHelper.Param("@DSRNumber", SqlDbType.VarChar, req.DSRNumber ?? "", 8000),
                SqlHelper.Param("@DSRDate", SqlDbType.DateTime, req.DSRDate),
                SqlHelper.TableParam("@DSRTable", "UDT_DSRTimeSheetDtl", dsrTable),
                SqlHelper.TableParam("@DSRjobSummary", "UDT_DSRJobSummaryDtl", jobTable),
                SqlHelper.Param("@Remarks", SqlDbType.VarChar, req.Remarks ?? "", 8000),
                SqlHelper.Param("@CreatedBy", SqlDbType.Int, userCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, req.PeriodId),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, req.BranchCode),
                SqlHelper.Param("@CompanyCode", SqlDbType.Int, req.CompanyCode),
                SqlHelper.Param("@Mode", SqlDbType.Int, mode)
            };

            var result = _db.DataTransactionsByProcedure("usp_Manage_PayrollDSRTimeSheet", p);

            int dsrCode = req.DSRCode;
            if (mode == 0)
            {
                var dt = _db.GetDataTableFromQuery("select ISNULL(MAX(DSRCode),0) as Code from DSRTimeSheetHdr");
                dsrCode = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["Code"]) : 0;
            }

            if (mode == 0) _audit.LogAdd("DSR Time Sheet", $"{req.DSRNumber} - DSR Time Sheet Added", req.BranchCode);
            else _audit.LogEdit("DSR Time Sheet", $"{req.DSRNumber} - DSR Time Sheet Edited", req.BranchCode);

            return (result, dsrCode);
        }

        public string Delete(int dsrCode)
        {
            var result = _db.DataTransactionsByProcedure(
                "usp_Manage_PayrollDSRTimeSheet",
                new[]
                {
                    SqlHelper.Param("@DSRCode", SqlDbType.Int, dsrCode),
                    SqlHelper.Param("@DSRNumber", SqlDbType.VarChar, "", 8000),
                    SqlHelper.Param("@DSRDate", SqlDbType.DateTime, DateTime.Today),
                    SqlHelper.TableParam("@DSRTable", "UDT_DSRTimeSheetDtl", BuildLinesTable(new())),
                    SqlHelper.TableParam("@DSRjobSummary", "UDT_DSRJobSummaryDtl", BuildJobSummaryTable(new())),
                    SqlHelper.Param("@Remarks", SqlDbType.VarChar, "", 8000),
                    SqlHelper.Param("@CreatedBy", SqlDbType.Int, 0),
                    SqlHelper.Param("@PeriodId", SqlDbType.Int, 0),
                    SqlHelper.Param("@BranchCode", SqlDbType.Int, 0),
                    SqlHelper.Param("@CompanyCode", SqlDbType.Int, 0),
                    SqlHelper.Param("@Mode", SqlDbType.Int, 2)
                });
            _audit.LogDelete("DSR Time Sheet", $"DSR Code {dsrCode} deleted");
            return result;
        }

        // Column order matches UDT_DSRTimeSheetDtl exactly (TVP columns are matched positionally by
        // ordinal, not by name).
        private static DataTable BuildLinesTable(List<DSRTimeSheetLineRow> lines)
        {
            var dt = NewTable(
                ("SlNo", typeof(int)),
                ("EmployeeCode", typeof(int)),
                ("EmpFullName", typeof(string)),
                ("AttStatusCode", typeof(int)),
                ("ActualHrs", typeof(decimal)),
                ("Basic", typeof(decimal)),
                ("OT1", typeof(decimal)),
                ("OT2", typeof(decimal)),
                ("IDLE", typeof(decimal)),
                ("Category", typeof(string)),
                ("MultiActual", typeof(string)),
                ("SOCode", typeof(string)),
                ("SupervisorCode", typeof(string)),
                ("Supervisor", typeof(string)),
                ("SoNo", typeof(string)),
                ("Paid", typeof(decimal))
            );
            foreach (var l in lines)
            {
                dt.Rows.Add(
                    l.SlNo, l.EmployeeCode, l.EmpFullName ?? "", l.AttStatusCode, l.ActualHrs,
                    l.Basic, l.OT1, l.OT2, l.Idle, l.Category ?? "", l.MultiActual ?? "",
                    l.SOCode ?? "", l.SupervisorCode ?? "", l.Supervisor ?? "", l.SoNo ?? "", l.Paid);
            }
            return dt;
        }

        // Column order matches UDT_DSRJobSummaryDtl exactly.
        private static DataTable BuildJobSummaryTable(List<DSRJobSummaryRow> rows)
        {
            var dt = NewTable(
                ("SlNo", typeof(int)),
                ("SoNo", typeof(string)),
                ("SOCode", typeof(int)),
                ("ActualHrs", typeof(decimal)),
                ("Basic", typeof(decimal)),
                ("OT", typeof(decimal)),
                ("Paid", typeof(decimal)),
                ("IDLE", typeof(decimal))
            );
            foreach (var r in rows)
            {
                dt.Rows.Add(r.SlNo, r.SoNo ?? "", r.SOCode, r.ActualHrs, r.Basic, r.OT, r.Paid, r.Idle);
            }
            return dt;
        }

        private static DataTable NewTable(params (string Name, Type Type)[] columns)
        {
            var dt = new DataTable();
            foreach (var col in columns) dt.Columns.Add(col.Name, col.Type);
            return dt;
        }
    }
}
