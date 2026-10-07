using System.Data;
using System.Text.Json;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    // Independent sibling of LabourAttendanceService - see StaffAttendanceModels.cs for why.
    // Shares the EmployeeFaceDescriptor table with Labour Attendance (a face doesn't change
    // depending on which module recognizes it) but its own StaffAttendance data table, and no
    // Job/Sales Order concept anywhere.
    public class StaffAttendanceService
    {
        private readonly SqlHelper _db;
        private readonly WebAuditService _audit;

        public StaffAttendanceService(SqlHelper db, WebAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        // "STAFF" per the desktop's own KPI definition (CategoryCode IN (9,10,11): Technical
        // Staff/Office-Management/Technician) - the complement of Labour Attendance's 12/13/14 pool.
        public DataTable GetEmployees() => _db.GetDataTableFromQuery(
            "select EmployeeCode, EmpFullName from payrollEmployeeInfo where ActiveYesNo='Y' and isnull(CategoryCode,0) in (9,10,11) order by EmpFullName");

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
        public void SaveDescriptorSet(int employeeCode, List<StaffFaceDescriptorCapture> captures, int userCode)
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

        // EmployeeFaceDescriptorCapture is shared with Labour Attendance (same physical face either
        // way), but the MATCHER built from this must only ever contain Staff (CategoryCode 9/10/11) -
        // an unfiltered list let a staff member's face get recognized and checked in on the Labour
        // Attendance screen (and vice versa), since both screens' matchers otherwise pulled from
        // the exact same unrestricted table. Each employee now has several rows (one per enrolled
        // angle) - the frontend groups them back together before building the matcher.
        public List<StaffFaceDescriptorRow> GetAllDescriptors()
        {
            var dt = _db.GetDataTableFromQuery(
                @"select D.EmployeeCode, E.EmpFullName, D.Descriptor
                  from EmployeeFaceDescriptorCapture D
                  inner join payrollEmployeeInfo E on E.EmployeeCode = D.EmployeeCode
                  where isnull(E.CategoryCode,0) in (9,10,11)");

            var rows = new List<StaffFaceDescriptorRow>();
            foreach (DataRow r in dt.Rows)
            {
                List<float> descriptor;
                try { descriptor = JsonSerializer.Deserialize<List<float>>(r["Descriptor"]?.ToString() ?? "[]") ?? new(); }
                catch { descriptor = new(); }

                rows.Add(new StaffFaceDescriptorRow
                {
                    EmployeeCode = Convert.ToInt32(r["EmployeeCode"]),
                    EmpFullName = r["EmpFullName"] as string ?? "",
                    Descriptor = descriptor
                });
            }
            return rows;
        }

        // Same Check In / Check Out toggle logic as Labour Attendance, minus JobCode entirely.
        public StaffRecordAttendanceResult RecordAttendance(int employeeCode, decimal? matchConfidence, decimal? latitude, decimal? longitude, int userCode)
        {
            var today = DateTime.Today;

            // Safety net for a forgotten Check Out: any still-open record from a PRIOR day is
            // auto-closed at 23:59:59 of its own DocDate (not today) before today's scan is
            // processed, so it can never be mistaken for an open Check In on a later day's scan.
            _db.ExecuteNonQuery(
                @"update StaffAttendance set CheckOutTime = DATEADD(second, -1, DATEADD(day, 1, CAST(DocDate as datetime)))
                  where EmployeeCode = @EmployeeCode and DocDate < @Today and CheckOutTime is null",
                new[]
                {
                    SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                    SqlHelper.Param("@Today", SqlDbType.Date, today)
                });

            var dt = _db.GetDataTableFromQuery(
                @"select top 1 Code, CheckInTime, CheckOutTime from StaffAttendance
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
                    @"update StaffAttendance set CheckOutTime = @Now, MatchConfidence = @Confidence,
                        CheckOutLatitude = @Latitude, CheckOutLongitude = @Longitude where Code = @Code",
                    new[]
                    {
                        SqlHelper.Param("@Now", SqlDbType.DateTime, now),
                        SqlHelper.Param("@Confidence", SqlDbType.Decimal, matchConfidence),
                        SqlHelper.Param("@Latitude", SqlDbType.Decimal, latitude),
                        SqlHelper.Param("@Longitude", SqlDbType.Decimal, longitude),
                        SqlHelper.Param("@Code", SqlDbType.Int, code)
                    });
                _audit.LogEdit("Staff Attendance", $"{EmployeeName(employeeCode)} Checked Out at {now:HH:mm}");
                return new StaffRecordAttendanceResult { Action = "CheckOut", Time = now };
            }

            _db.ExecuteNonQuery(
                @"insert into StaffAttendance (EmployeeCode, DocDate, CheckInTime, MatchConfidence,
                    CheckInLatitude, CheckInLongitude, CreatedBy)
                  values (@EmployeeCode, @DocDate, @Now, @Confidence, @Latitude, @Longitude, @CreatedBy)",
                new[]
                {
                    SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode),
                    SqlHelper.Param("@DocDate", SqlDbType.Date, today),
                    SqlHelper.Param("@Now", SqlDbType.DateTime, now),
                    SqlHelper.Param("@Confidence", SqlDbType.Decimal, matchConfidence),
                    SqlHelper.Param("@Latitude", SqlDbType.Decimal, latitude),
                    SqlHelper.Param("@Longitude", SqlDbType.Decimal, longitude),
                    SqlHelper.Param("@CreatedBy", SqlDbType.Int, userCode)
                });
            _audit.LogAdd("Staff Attendance", $"{EmployeeName(employeeCode)} Checked In at {now:HH:mm}");
            return new StaffRecordAttendanceResult { Action = "CheckIn", Time = now };
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
            @"select A.Code, A.EmployeeCode, E.EmpFullName, A.DocDate, A.CheckInTime, A.CheckOutTime, A.MatchConfidence
              from StaffAttendance A
              left join payrollEmployeeInfo E on E.EmployeeCode = A.EmployeeCode
              where A.DocDate = @DocDate
              order by A.CheckInTime desc",
            new[] { SqlHelper.Param("@DocDate", SqlDbType.Date, date.Date) });

        public List<StaffAttendanceReportRow> GetReport(DateTime fromDate, DateTime toDate, int? employeeCode)
        {
            var dt = _db.GetDataTableFromQuery(
                @"select A.Code, A.EmployeeCode, E.EmpFullName, A.DocDate,
                         A.CheckInTime, A.CheckOutTime, A.CheckInLatitude, A.CheckInLongitude,
                         A.CheckOutLatitude, A.CheckOutLongitude
                  from StaffAttendance A
                  left join payrollEmployeeInfo E on E.EmployeeCode = A.EmployeeCode
                  where A.DocDate >= @FromDate and A.DocDate < @ToDatePlusOne
                    and (@EmployeeCode is null or A.EmployeeCode = @EmployeeCode)
                  order by A.DocDate desc, A.CheckInTime desc",
                new[]
                {
                    SqlHelper.Param("@FromDate", SqlDbType.Date, fromDate.Date),
                    SqlHelper.Param("@ToDatePlusOne", SqlDbType.Date, toDate.Date.AddDays(1)),
                    SqlHelper.Param("@EmployeeCode", SqlDbType.Int, employeeCode)
                });

            var rows = new List<StaffAttendanceReportRow>();
            foreach (DataRow r in dt.Rows)
            {
                rows.Add(new StaffAttendanceReportRow
                {
                    Code = Convert.ToInt32(r["Code"]),
                    EmployeeCode = Convert.ToInt32(r["EmployeeCode"]),
                    EmpFullName = r["EmpFullName"] as string ?? "",
                    DocDate = (DateTime)r["DocDate"],
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
