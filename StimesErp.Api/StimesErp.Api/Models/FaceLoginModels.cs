namespace StimesErp.Api.Models
{
    public class FaceLoginCompleteRequest
    {
        public int EmployeeCode { get; set; }

        // Recomputed and re-checked against the required threshold server-side too (see
        // FaceLoginService.MinConfidencePercent) - this is what the client-side face-api.js match
        // reported, trusted the same way Staff/Labour Attendance already trusts a client-reported
        // match for marking attendance, just held to a stricter minimum since logging in is a much
        // higher-stakes action than a check-in.
        public int ConfidencePercent { get; set; }
    }
}
