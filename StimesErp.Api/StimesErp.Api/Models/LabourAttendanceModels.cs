using System.Text.Json.Serialization;

namespace StimesErp.Api.Models
{
    // One guided-capture angle (Center/Left/Right/Up/Down) taken during enrollment.
    public class FaceDescriptorCapture
    {
        public string AngleLabel { get; set; } = string.Empty;
        public List<float> Descriptor { get; set; } = new();
    }

    // Submits the WHOLE angle set for one employee at once - enrolling always replaces any
    // previous captures for that employee with this fresh set, rather than accumulating stale
    // ones from earlier attempts.
    public class FaceEnrollRequest
    {
        public int EmployeeCode { get; set; }
        public List<FaceDescriptorCapture> Captures { get; set; } = new();
    }

    // One row of GET /labourattendance/face-descriptors - the frontend loads all of these once
    // and does the actual face matching itself (face-api.js's FaceMatcher), since that's a
    // client-side-only operation - descriptors never need matching server-side. An employee now
    // has several rows (one per enrolled angle), which the frontend groups back together per
    // employee before handing them to the matcher.
    public class FaceDescriptorRow
    {
        public int EmployeeCode { get; set; }
        public string EmpFullName { get; set; } = string.Empty;
        public List<float> Descriptor { get; set; } = new();
    }

    public class RecordAttendanceRequest
    {
        public int EmployeeCode { get; set; }
        public decimal? MatchConfidence { get; set; }
        public int? JobCode { get; set; }
        public decimal? Latitude { get; set; }
        public decimal? Longitude { get; set; }
    }

    public class RecordAttendanceResult
    {
        public string Action { get; set; } = string.Empty; // "CheckIn" or "CheckOut"
        public DateTime Time { get; set; }
    }

    // One employee who already has a photo uploaded elsewhere in the ERP (payrollEmployeeInfo.EmpPhoto)
    // - lets Enroll build face descriptors from that existing photo instead of requiring a live
    // camera capture per person.
    public class EmployeeWithPhotoRow
    {
        public int EmployeeCode { get; set; }
        public string EmpFullName { get; set; } = string.Empty;
    }

    // One row of the Payroll > Labour Attendance Report - deliberately separate from the live
    // Scan tab's Today's Attendance table (which stays simple/fast for walk-up use), for
    // supervisors reviewing where/when people actually checked in and out over a date range.
    public class LabourAttendanceReportRow
    {
        public int Code { get; set; }
        public int EmployeeCode { get; set; }
        public string EmpFullName { get; set; } = string.Empty;
        public DateTime DocDate { get; set; }
        public int? JobCode { get; set; }
        // Forces the exact casing in the JSON response - the automatic camelCase policy handles
        // an all-caps-then-lowercase name like "SONo" inconsistently, and the frontend's read()
        // helper only tries the exact name and one straightforward camelCase variant.
        [JsonPropertyName("SONo")]
        public string? SONo { get; set; }
        public DateTime? CheckInTime { get; set; }
        public DateTime? CheckOutTime { get; set; }
        public decimal? CheckInLatitude { get; set; }
        public decimal? CheckInLongitude { get; set; }
        public decimal? CheckOutLatitude { get; set; }
        public decimal? CheckOutLongitude { get; set; }
    }
}
