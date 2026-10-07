namespace StimesErp.Api.Models
{
    // Staff Attendance is Labour Attendance's independent sibling for office/technical staff
    // (CategoryCode 9/10/11 - Technical Staff/Office-Management/Technician, per the desktop's own
    // "STAFF" KPI definition) instead of labourers (12/13/14). No Job/Sales Order concept at all -
    // office staff aren't tied to a site job the way labourers are, so every model here is the
    // same shape as LabourAttendanceModels minus JobCode/SONo.

    // Same guided-capture shape as Labour Attendance's FaceDescriptorCapture/FaceEnrollRequest -
    // enrolling submits the whole angle set at once, replacing any previous captures.
    public class StaffFaceDescriptorCapture
    {
        public string AngleLabel { get; set; } = string.Empty;
        public List<float> Descriptor { get; set; } = new();
    }

    public class StaffFaceEnrollRequest
    {
        public int EmployeeCode { get; set; }
        public List<StaffFaceDescriptorCapture> Captures { get; set; } = new();
    }

    // An employee now has several rows (one per enrolled angle) - the frontend groups them back
    // together per employee before handing them to the matcher.
    public class StaffFaceDescriptorRow
    {
        public int EmployeeCode { get; set; }
        public string EmpFullName { get; set; } = string.Empty;
        public List<float> Descriptor { get; set; } = new();
    }

    public class StaffRecordAttendanceRequest
    {
        public int EmployeeCode { get; set; }
        public decimal? MatchConfidence { get; set; }
        public decimal? Latitude { get; set; }
        public decimal? Longitude { get; set; }
    }

    public class StaffRecordAttendanceResult
    {
        public string Action { get; set; } = string.Empty; // "CheckIn" or "CheckOut"
        public DateTime Time { get; set; }
    }

    public class StaffAttendanceReportRow
    {
        public int Code { get; set; }
        public int EmployeeCode { get; set; }
        public string EmpFullName { get; set; } = string.Empty;
        public DateTime DocDate { get; set; }
        public DateTime? CheckInTime { get; set; }
        public DateTime? CheckOutTime { get; set; }
        public decimal? CheckInLatitude { get; set; }
        public decimal? CheckInLongitude { get; set; }
        public decimal? CheckOutLatitude { get; set; }
        public decimal? CheckOutLongitude { get; set; }
    }
}
