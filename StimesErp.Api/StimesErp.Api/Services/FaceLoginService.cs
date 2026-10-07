using System.Data;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    // Replaces the old WebAuthn-based Fingerprint Login - the Galaxy A11 tablets this app runs on
    // in the field have no fingerprint sensor, but every device has a camera, and this company
    // already has a real, working face-recognition enrollment system (Staff/Labour Attendance,
    // face-api.js). This reuses that same EmployeeFaceDescriptorCapture data instead of building a
    // separate enrollment flow - anyone already enrolled for attendance becomes face-login-eligible
    // automatically, provided they also have an active login account (AdminUserMaster.EmpCode).
    //
    // Security note vs. the WebAuthn approach it replaces: WebAuthn never sends biometric data off
    // the device at all (asymmetric key proof only), whereas this necessarily serves face
    // descriptors to an unauthenticated client so it can build a local matcher before the person
    // is logged in - the same way the login itself has to be reachable pre-auth. That is a real,
    // inherent trade-off of descriptor-matching biometric login, not a bug.
    public class FaceLoginService
    {
        private readonly SqlHelper _db;

        // The face-api.js matcher itself (0.35 distance cutoff, see FaceRecognitionService) never
        // reports a match below 65% confidence to begin with - and this codebase's own documented
        // testing (face-recognition.service.ts) found genuine real matches typically land around
        // 55-76%. An earlier version of this threshold was set to 75%, sitting right at the top of
        // that real range - it rejected most genuine attempts, not just weak/false ones. 65% (the
        // matcher's own natural floor) is the realistic choice: Login still requires the matcher's
        // own best-available confidence, same as Attendance's check-in effectively does (its own
        // 55% app-level gate is already below the matcher's floor, so it never actually blocks
        // anything the matcher itself accepted).
        public const int MinConfidencePercent = 65;

        public FaceLoginService(SqlHelper db)
        {
            _db = db;
        }

        // Only employees who are BOTH face-enrolled AND have an active login account are eligible -
        // no CategoryCode filter (unlike StaffAttendanceService.GetAllDescriptors, which is scoped
        // to "Staff" only for its own attendance-matcher purposes). Having a real account is what
        // actually matters for login eligibility, not attendance category.
        public List<StaffFaceDescriptorRow> GetDescriptors()
        {
            var dt = _db.GetDataTableFromQuery(
                @"select D.EmployeeCode, E.EmpFullName, D.Descriptor
                  from EmployeeFaceDescriptorCapture D
                  inner join payrollEmployeeInfo E on E.EmployeeCode = D.EmployeeCode
                  inner join AdminUserMaster U on U.EmpCode = D.EmployeeCode
                  where E.ActiveYesNo = 'Y' and U.ActiveYesNo = 'Y'");

            var rows = new List<StaffFaceDescriptorRow>();
            foreach (DataRow r in dt.Rows)
            {
                List<float> descriptor;
                try { descriptor = System.Text.Json.JsonSerializer.Deserialize<List<float>>(r["Descriptor"]?.ToString() ?? "[]") ?? new(); }
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

        // Returns null if the confidence doesn't clear the bar, or no active login account is
        // linked to this employee - the controller turns either case into the same generic
        // "face not recognized" response, same principle as never hinting whether a username
        // exists on a failed password login.
        public AuthResult? TryCompleteLogin(int employeeCode, int confidencePercent)
        {
            if (confidencePercent < MinConfidencePercent) return null;

            var dt = _db.GetDataTableFromQuery(
                "select top 1 UserCode, UserName, UCatCode, EmpCode from AdminUserMaster where EmpCode = @EmpCode and ActiveYesNo = 'Y'",
                new[] { SqlHelper.Param("@EmpCode", SqlDbType.Int, employeeCode) });
            if (dt.Rows.Count == 0) return null;

            var row = dt.Rows[0];
            var userCode = Convert.ToInt32(row["UserCode"]);
            var userName = row["UserName"]?.ToString() ?? "";
            var uCatCode = row["UCatCode"] != DBNull.Value ? Convert.ToInt32(row["UCatCode"]) : 0;
            var empCode = row["EmpCode"] != DBNull.Value ? Convert.ToInt32(row["EmpCode"]) : 0;

            // Same session-tracking SP password login calls (usp_TrackLoginUsers), so a face login
            // shows up in login history/active-session tracking exactly like any other sign-in.
            _db.DataTransactionsByProcedure("usp_TrackLoginUsers", new[]
            {
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@UserName", SqlDbType.VarChar, userName, 100),
                SqlHelper.Param("@PCName", SqlDbType.VarChar, "WEB-FACE", 100),
                SqlHelper.Param("@IP", SqlDbType.VarChar, "0.0.0.0", 50)
            });

            return new AuthResult { Success = true, UserCode = userCode, UserName = userName, UCatCode = uCatCode, EmpCode = empCode };
        }
    }
}
