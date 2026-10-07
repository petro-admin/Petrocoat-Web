using System.Data;
using System.Text.Json;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    public class LabourAttendanceService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public LabourAttendanceService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // Same labour pool Daily Site's Employee Hrs grid actually uses (DailySiteService.GetLabourers,
        // CategoryCode 12/13/14) - NOT the CategoryCode 9/10/11 pool, which is Daily Site's
        // Supervisor/Engineer/Materials-Received-By lookup instead.
        public DataTable GetEmployees() => _db.GetDataTableFromQuery(
            "select EmployeeCode, EmpFullName from payrollEmployeeInfo where ActiveYesNo='Y' and (isnull(CategoryCode,0)=12 or isnull(CategoryCode,0)=13 or isnull(CategoryCode,0)=14) order by EmpFullName");

        // Same read-only, desktop-shared Sales Order lookup Daily Site's own dropdown uses.
        public DataTable GetSalesOrders() => _db.GetDataTableFromProcedure("usp_GetDailySiteSalesOrderNo");

        public List<EmployeeWithPhotoRow> GetEmployeesWithPhoto()
        {
            var dt = _db.GetDataTableFromQuery(
                "select EmployeeCode, EmpFullName from payrollEmployeeInfo " +
                "where ActiveYesNo='Y' and (isnull(CategoryCode,0)=12 or isnull(CategoryCode,0)=13 or isnull(CategoryCode,0)=14) " +
                "and EmpPhoto is not null and LEN(EmpPhoto) > 0 order by EmpFullName");

            var rows = new List<EmployeeWithPhotoRow>();
            foreach (DataRow r in dt.Rows)
                rows.Add(new EmployeeWithPhotoRow { EmployeeCode = Convert.ToInt32(r["EmployeeCode"]), EmpFullName = r["EmpFullName"] as string ?? "" });
            return rows;
        }

        // The raw path as stored (usually a UNC path like \\erpsrv\stimes\uploaded\...) - the
        // controller reads the actual file bytes from this path server-side, since a browser
        // can't load a filesystem/UNC path directly.
        public string? GetEmployeePhotoPath(int employeeCode)
        {
            var dt = _db.GetDataTableFromQuery(
                "select EmpPhoto from payrollEmployeeInfo where EmployeeCode = @EmployeeCode",
                new[] { SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode) });
            return dt.Rows.Count > 0 ? dt.Rows[0]["EmpPhoto"] as string : null;
        }

        // Replaces this employee's ENTIRE enrolled angle set (Center/Left/Right/Up/Down) with the
        // fresh set just captured - re-enrolling always starts clean rather than accumulating
        // stale captures from an earlier, possibly poor-quality attempt.
        public void SaveDescriptorSet(int employeeCode, List<FaceDescriptorCapture> captures, int userCode)
        {
            _db.ExecuteNonQuery(
                "delete from EmployeeFaceDescriptorCapture where EmployeeCode = @EmployeeCode",
                new[] { SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode) });

            foreach (var capture in captures)
            {
                var json = JsonSerializer.Serialize(capture.Descriptor);
                _db.ExecuteNonQuery(
                    @"insert into EmployeeFaceDescriptorCapture (EmployeeCode, AngleLabel, Descriptor, EnrolledBy)
                      values (@EmployeeCode, @AngleLabel, @Descriptor, @EnrolledBy)",
                    new[]
                    {
                        SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                        SqlHelper.Param("@AngleLabel", SqlDbType.VarChar, capture.AngleLabel ?? "", 20),
                        SqlHelper.Param("@Descriptor", SqlDbType.NVarChar, json),
                        SqlHelper.Param("@EnrolledBy", SqlDbType.Int, userCode)
                    });
            }
        }

        // EmployeeFaceDescriptorCapture is shared with Staff Attendance (same physical face either
        // way), but the MATCHER built from this must only ever contain Labour (CategoryCode
        // 12/13/14) - an unfiltered list let a labourer's face get recognized and checked in on the
        // Staff Attendance screen (and vice versa), since both screens' matchers otherwise pulled
        // from the exact same unrestricted table. Each employee now has several rows (one per
        // enrolled angle) - the frontend groups them back together before building the matcher.
        public List<FaceDescriptorRow> GetAllDescriptors()
        {
            var dt = _db.GetDataTableFromQuery(
                @"select D.EmployeeCode, E.EmpFullName, D.Descriptor
                  from EmployeeFaceDescriptorCapture D
                  inner join payrollEmployeeInfo E on E.EmployeeCode = D.EmployeeCode
                  where isnull(E.CategoryCode,0) in (12,13,14)");

            var rows = new List<FaceDescriptorRow>();
            foreach (DataRow r in dt.Rows)
            {
                List<float> descriptor;
                try { descriptor = JsonSerializer.Deserialize<List<float>>(r["Descriptor"]?.ToString() ?? "[]") ?? new(); }
                catch { descriptor = new(); }

                rows.Add(new FaceDescriptorRow
                {
                    EmployeeCode = Convert.ToInt32(r["EmployeeCode"]),
                    EmpFullName = r["EmpFullName"] as string ?? "",
                    Descriptor = descriptor
                });
            }
            return rows;
        }

        // First scan of the day for an employee = Check In. Next scan (once a Check In already
        // exists without a Check Out) = Check Out. A scan after both are already set starts a
        // fresh Check In/Check Out pair (handles a labourer leaving and returning the same day).
        // Latitude/Longitude come from the browser's Geolocation API at the moment of the scan -
        // stored into whichever pair (CheckIn.. / CheckOut..) matches this action, so supervisors
        // can verify via the Labour Attendance Report that people actually scanned in at the site.
        public RecordAttendanceResult RecordAttendance(int employeeCode, decimal? matchConfidence, int? jobCode, decimal? latitude, decimal? longitude, int userCode)
        {
            var today = DateTime.Today;

            // Safety net for a forgotten Check Out: any still-open record from a PRIOR day is
            // auto-closed at 23:59:59 of its own DocDate (not today) before today's scan is
            // processed, so it can never be mistaken for an open Check In on a later day's scan.
            _db.ExecuteNonQuery(
                @"update LabourAttendance set CheckOutTime = DATEADD(second, -1, DATEADD(day, 1, CAST(DocDate as datetime)))
                  where EmployeeCode = @EmployeeCode and DocDate < @Today and CheckOutTime is null",
                new[]
                {
                    SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                    SqlHelper.Param("@Today", SqlDbType.Date, today)
                });

            var dt = _db.GetDataTableFromQuery(
                @"select top 1 Code, CheckInTime, CheckOutTime from LabourAttendance
                  where EmployeeCode = @EmployeeCode and DocDate = @DocDate and CheckOutTime is null
                  order by Code desc",
                new[]
                {
                    SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                    SqlHelper.Param("@DocDate", SqlDbType.Date, today)
                });

            var now = DateTime.Now;

            if (dt.Rows.Count > 0)
            {
                var code = Convert.ToInt32(dt.Rows[0]["Code"]);
                _db.ExecuteNonQuery(
                    @"update LabourAttendance set CheckOutTime = @Now, MatchConfidence = @Confidence,
                        CheckOutLatitude = @Latitude, CheckOutLongitude = @Longitude where Code = @Code",
                    new[]
                    {
                        SqlHelper.Param("@Now", SqlDbType.DateTime, now),
                        SqlHelper.Param("@Confidence", SqlDbType.Decimal, matchConfidence),
                        SqlHelper.Param("@Latitude", SqlDbType.Decimal, latitude),
                        SqlHelper.Param("@Longitude", SqlDbType.Decimal, longitude),
                        SqlHelper.Param("@Code", SqlDbType.Int, code)
                    });
                _audit.LogEdit("Labour Attendance", $"{EmployeeName(employeeCode)} Checked Out at {now:HH:mm}");
                return new RecordAttendanceResult { Action = "CheckOut", Time = now };
            }

            _db.ExecuteNonQuery(
                @"insert into LabourAttendance (EmployeeCode, DocDate, CheckInTime, MatchConfidence, JobCode,
                    CheckInLatitude, CheckInLongitude, CreatedBy)
                  values (@EmployeeCode, @DocDate, @Now, @Confidence, @JobCode, @Latitude, @Longitude, @CreatedBy)",
                new[]
                {
                    SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                    SqlHelper.Param("@DocDate", SqlDbType.Date, today),
                    SqlHelper.Param("@Now", SqlDbType.DateTime, now),
                    SqlHelper.Param("@Confidence", SqlDbType.Decimal, matchConfidence),
                    SqlHelper.Param("@JobCode", SqlDbType.Int, jobCode),
                    SqlHelper.Param("@Latitude", SqlDbType.Decimal, latitude),
                    SqlHelper.Param("@Longitude", SqlDbType.Decimal, longitude),
                    SqlHelper.Param("@CreatedBy", SqlDbType.Int, userCode)
                });
            _audit.LogAdd("Labour Attendance", $"{EmployeeName(employeeCode)} Checked In at {now:HH:mm}");
            return new RecordAttendanceResult { Action = "CheckIn", Time = now };
        }

        // Audit log narrations read far better with a real name than a bare EmployeeCode - falls
        // back to the code itself if the employee row is somehow gone, rather than leaving a blank.
        private string EmployeeName(int employeeCode)
        {
            var dt = _db.GetDataTableFromQuery(
                "select EmpFullName from payrollEmployeeInfo where EmployeeCode = @EmployeeCode",
                new[] { SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode) });
            var name = dt.Rows.Count > 0 ? dt.Rows[0]["EmpFullName"]?.ToString() : null;
            return string.IsNullOrWhiteSpace(name) ? $"Employee {employeeCode}" : name;
        }

        public DataTable GetList(DateTime date) => _db.GetDataTableFromQuery(
            @"select A.Code, A.EmployeeCode, E.EmpFullName, A.DocDate, A.CheckInTime, A.CheckOutTime, A.MatchConfidence,
                     A.JobCode, S.SONo
              from LabourAttendance A
              left join payrollEmployeeInfo E on E.EmployeeCode = A.EmployeeCode
              left join SalesOrderNew S on S.SOCode = A.JobCode
              where A.DocDate = @DocDate
              order by A.CheckInTime desc",
            new[] { SqlHelper.Param("@DocDate", SqlDbType.Date, date.Date) });

        // Payroll > Labour Attendance Report - Job No / date range / employee are all optional
        // filters (null = no filter on that column).
        public List<LabourAttendanceReportRow> GetReport(DateTime fromDate, DateTime toDate, int? jobCode, int? employeeCode)
        {
            var dt = _db.GetDataTableFromQuery(
                @"select A.Code, A.EmployeeCode, E.EmpFullName, A.DocDate, A.JobCode, S.SONo,
                         A.CheckInTime, A.CheckOutTime, A.CheckInLatitude, A.CheckInLongitude,
                         A.CheckOutLatitude, A.CheckOutLongitude
                  from LabourAttendance A
                  left join payrollEmployeeInfo E on E.EmployeeCode = A.EmployeeCode
                  left join SalesOrderNew S on S.SOCode = A.JobCode
                  where A.DocDate >= @FromDate and A.DocDate < @ToDatePlusOne
                    and (@JobCode is null or A.JobCode = @JobCode)
                    and (@EmployeeCode is null or A.EmployeeCode = @EmployeeCode)
                  order by A.DocDate desc, A.CheckInTime desc",
                new[]
                {
                    SqlHelper.Param("@FromDate", SqlDbType.Date, fromDate.Date),
                    SqlHelper.Param("@ToDatePlusOne", SqlDbType.Date, toDate.Date.AddDays(1)),
                    SqlHelper.Param("@JobCode", SqlDbType.Int, jobCode),
                    SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode)
                });

            var rows = new List<LabourAttendanceReportRow>();
            foreach (DataRow r in dt.Rows)
            {
                rows.Add(new LabourAttendanceReportRow
                {
                    Code = Convert.ToInt32(r["Code"]),
                    EmployeeCode = Convert.ToInt32(r["EmployeeCode"]),
                    EmpFullName = r["EmpFullName"] as string ?? "",
                    DocDate = (DateTime)r["DocDate"],
                    JobCode = r["JobCode"] as int?,
                    SONo = r["SONo"] as string,
                    CheckInTime = r["CheckInTime"] as DateTime?,
                    CheckOutTime = r["CheckOutTime"] as DateTime?,
                    CheckInLatitude = r["CheckInLatitude"] as decimal?,
                    CheckInLongitude = r["CheckInLongitude"] as decimal?,
                    CheckOutLatitude = r["CheckOutLatitude"] as decimal?,
                    CheckOutLongitude = r["CheckOutLongitude"] as decimal?
                });
            }
            return rows;
        }
    }
}
