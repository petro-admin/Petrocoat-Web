using System.Data;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    // Web port of Stimes.Erp.App.Win.Production.ManpowerSchedule - desktop's own FormClassName,
    // reused verbatim for the rights-check call. Exact same SPs/UDTs as desktop
    // (usp_ManageManpowerSchedule, UDT_ManpowerScheduleDtl, UDT_ManpowerScheduleIdleEmpDtl, etc.),
    // confirmed directly against OBJECT_DEFINITION/sys.table_types rather than assumed.
    public class ManpowerScheduleService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public ManpowerScheduleService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // usp_GetManpowerScheduleSideList does double duty: @Code=0 returns the whole side-list
        // (grouped/ordered by month) for the period; a specific @Code re-fetches just that header.
        public DataTable GetSideList(int periodId) =>
            _db.GetDataTableFromProcedure("usp_GetManpowerScheduleSideList", new[]
            {
                SqlHelper.Param("@Code", SqlDbType.Int, 0),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId)
            });

        public DataTable GetHeader(int code, int periodId) =>
            _db.GetDataTableFromProcedure("usp_GetManpowerScheduleSideList", new[]
            {
                SqlHelper.Param("@Code", SqlDbType.Int, code),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId)
            });

        public DataTable GetDtl(int code) =>
            _db.GetDataTableFromProcedure("usp_GetManpowerScheduleDtl", new[]
            {
                SqlHelper.Param("@Code", SqlDbType.Int, code)
            });

        public DataTable GetIdleEmpDtl(int code) =>
            _db.GetDataTableFromProcedure("usp_ManpowerScheduleIdleEmpDtl", new[]
            {
                SqlHelper.Param("@Code", SqlDbType.Int, code)
            });

        public string GenerateDocNo(DateTime docDate) =>
            _db.GetDataTableFromProcedure("usp_GenerateManpowerScheduleNo", new[]
            {
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, docDate)
            }).Rows[0][0]?.ToString() ?? "";

        // Mode 0 = insert, 1 = update, 2 = delete - same single SP desktop calls for all three,
        // @dtInner/@DtIdleEmp both fully replaced (delete-then-reinsert) on update, matching the
        // SP's own logic exactly (no diffing).
        public string Save(ManpowerScheduleSaveRequest req, int branchCode, int periodId, int userCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@Code", SqlDbType.Int, req.Code),
                SqlHelper.Param("@DocNo", SqlDbType.VarChar, req.DocNo, 4000),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, req.DocDate),
                SqlHelper.TableParam("@dtInner", "UDT_ManpowerScheduleDtl", ToDtlTable(req.Lines)),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@Mode", SqlDbType.Int, req.Mode),
                SqlHelper.TableParam("@DtIdleEmp", "UDT_ManpowerScheduleIdleEmpDtl", ToIdleEmpTable(req.IdleEmployees))
            };
            var result = _db.DataTransactionsByProcedure("usp_ManageManpowerSchedule", p);

            var narration = $"{req.DocNo} - Manpower Schedule";
            if (req.Mode == 0) _audit.LogAdd("Manpower Schedule", $"{narration} Added", branchCode);
            else if (req.Mode == 2) _audit.LogDelete("Manpower Schedule", $"{narration} Deleted", branchCode);
            else _audit.LogEdit("Manpower Schedule", $"{narration} Edited", branchCode);

            return result;
        }

        // Single-employee cross-document check used when merging a picked employee into the
        // grid - if this returns any rows, desktop silently skips adding that employee (already
        // scheduled elsewhere on the same date), no error shown.
        public bool IsEmployeeAlreadyScheduled(int code, DateTime docDate, int employeeCode) =>
            _db.GetDataTableFromProcedure("usp_GetManpowerScheduleExistingEmployeeChecking", new[]
            {
                SqlHelper.Param("@Code", SqlDbType.Int, code),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, docDate),
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode)
            }).Rows.Count > 0;

        // Powers the "Add Employees" picker grid - excludes anyone already in the current
        // in-memory grid (@dtData) or already scheduled on ANY document for this date, restricted
        // to labour categories (12/13/14). Source/SourceName is derived from the employee's own
        // BranchCode (5 = Hire, else Inhouse), not a stored per-employee value.
        public DataTable GetEmployeePickerList(int code, DateTime docDate, List<ManpowerScheduleDtlNewRow> currentGrid) =>
            _db.GetDataTableFromProcedure("usp_GetManpowerScheduleEmployeeListExistingEmployeeChecking", new[]
            {
                SqlHelper.Param("@Code", SqlDbType.Int, code),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, docDate),
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, 0),
                SqlHelper.TableParam("@dtData", "UDT_ManpowerScheduleDtlNew", ToDtlNewTable(currentGrid))
            });

        // Re-numbers SlNo per JobCode group and re-decorates JobNo/CustomerName display text -
        // run after merging newly-picked employees into the grid, and after SO Transfer.
        public DataTable GetAllSelectedEmployeeList(List<ManpowerScheduleDtlNewRow> data) =>
            _db.GetDataTableFromProcedure("usp_GetManpowerScheduleAllSelectedEmployeeList", new[]
            {
                SqlHelper.TableParam("@dtData", "UDT_ManpowerScheduleDtlNew", ToDtlNewTable(data))
            });

        // Same exclusion rules as the picker list, scoped to the Idle Employees grid - every
        // candidate comes back pre-set to StatusCode=1, matching the SP's own hardcoded default.
        public DataTable GetIdleEmployeeChecking(int code, DateTime docDate, List<ManpowerScheduleDtlNewRow> currentGrid) =>
            _db.GetDataTableFromProcedure("usp_GetManpowerScheduleIdleEmployeeListEmployeeChecking", new[]
            {
                SqlHelper.Param("@Code", SqlDbType.Int, code),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, docDate),
                SqlHelper.Param("@EmployeeCode", SqlDbType.Int, 0),
                SqlHelper.TableParam("@dtData", "UDT_ManpowerScheduleDtlNew", ToDtlNewTable(currentGrid))
            });

        // ---------- Dropdown lookups ----------

        public DataTable GetJobs() => _db.GetDataTableFromQuery(
            @"select S.SOCode as JobCode, S.SONo as JobNo, S.CustomerCode
              from SalesOrderNew S
              order by S.SONo");

        public DataTable GetCustomers() => _db.GetDataTableFromQuery(
            "select CustomerCode, CustomerName from sopCustomerInfo order by CustomerName");

        public DataTable GetSources() => _db.GetDataTableFromQuery(
            "select * from EmployeeSource");

        // Shift is hardcoded in the desktop app too - not a table.
        public DataTable GetShifts() => _db.GetDataTableFromQuery(
            "select 1 as ShiftCode,'Day' as ShiftName union all select 2,'Night'");

        public DataTable GetEmployees() => _db.GetDataTableFromQuery(
            "select EmployeeCode, EmpFullName from payrollEmployeeInfo where ActiveYesNo='Y' and (CategoryCode in (12,13,14)) order by EmpFullName");

        public DataTable GetSupervisors() => _db.GetDataTableFromQuery(
            "select EmployeeCode, EmpFullName from payrollEmployeeInfo where ActiveYesNo='Y' and BranchCode<>5 and CurrentDesigCode in (39,110,162) order by EmpFullName");

        public DataTable GetDrivers() => _db.GetDataTableFromQuery(
            "select EmployeeCode, EmpFullName from payrollEmployeeInfo where ActiveYesNo='Y' and CurrentDesigCode in (63,159) order by EmpFullName");

        public DataTable GetVehicles() => _db.GetDataTableFromQuery(
            "select VehicleCode, RegistrationNo from AdminVehicleInfo order by RegistrationNo");

        public DataTable GetIdleEmpStatuses() => _db.GetDataTableFromQuery(
            "select * from ManpowerScheduleEmployeeStatus");

        // ---------- TVP builders ----------

        private static DataTable ToDtlTable(List<ManpowerScheduleDtlRow> rows)
        {
            var dt = new DataTable();
            dt.Columns.Add("ChkYesNo", typeof(bool));
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add("JobCode", typeof(int));
            dt.Columns.Add("CustomerCode", typeof(int));
            dt.Columns.Add("EmployeeCode", typeof(int));
            dt.Columns.Add("SupervisorCode", typeof(int));
            dt.Columns.Add("Material", typeof(string));
            dt.Columns.Add("Consumable", typeof(string));
            dt.Columns.Add("Machinery", typeof(string));
            dt.Columns.Add("ShiftCode", typeof(int));
            dt.Columns.Add("DriverCode", typeof(int));
            dt.Columns.Add("Remarks", typeof(string));
            dt.Columns.Add("VehicleCode", typeof(int));
            dt.Columns.Add("SourceCode", typeof(int));
            dt.Columns.Add("Description", typeof(string));
            foreach (var r in rows)
                dt.Rows.Add(r.ChkYesNo, r.SlNo, r.JobCode, r.CustomerCode, r.EmployeeCode, r.SupervisorCode,
                    r.Material ?? "", r.Consumable ?? "", r.Machinery ?? "", r.ShiftCode, r.DriverCode,
                    r.Remarks ?? "", r.VehicleCode, r.SourceCode, r.Description ?? "");
            return dt;
        }

        private static DataTable ToDtlNewTable(List<ManpowerScheduleDtlNewRow> rows)
        {
            var dt = ToDtlTable(rows.Cast<ManpowerScheduleDtlRow>().ToList());
            dt.Columns.Add("JobNo", typeof(string));
            dt.Columns.Add("EmpFullName", typeof(string));
            for (var i = 0; i < rows.Count; i++)
            {
                dt.Rows[i]["JobNo"] = rows[i].JobNo ?? "";
                dt.Rows[i]["EmpFullName"] = rows[i].EmpFullName ?? "";
            }
            return dt;
        }

        private static DataTable ToIdleEmpTable(List<ManpowerScheduleIdleEmpRow> rows)
        {
            var dt = new DataTable();
            dt.Columns.Add("SlNo", typeof(int));
            dt.Columns.Add("EmployeeCode", typeof(int));
            dt.Columns.Add("StatusCode", typeof(int));
            dt.Columns.Add("Remarks", typeof(string));
            foreach (var r in rows)
                dt.Rows.Add(r.SlNo, r.EmployeeCode, r.StatusCode, r.Remarks ?? "");
            return dt;
        }
    }
}
