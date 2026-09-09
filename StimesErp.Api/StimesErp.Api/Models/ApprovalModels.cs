namespace StimesErp.Api.Models
{
    /// <summary>
    /// Generic Lock/Approve/Deny action, matching AdminApprovalSettings.ManageFormApprovals -
    /// the same shared approval subsystem used across many desktop forms (Cls_Authorization /
    /// AdminApprovalSettings / Payroll_Appreciation), not specific to Store Indent.
    /// </summary>
    public class ApprovalActionRequest
    {
        public int ModuleCode { get; set; }
        public int TransactionCode { get; set; }

        /// <summary>"L" (Lock) or "A" (Approve/Deny).</summary>
        public string Activity { get; set; } = string.Empty;

        /// <summary>"L"/"U" for lock activity, "A"/"D" for approve activity.</summary>
        public string Action { get; set; } = string.Empty;

        public string Comment { get; set; } = string.Empty;
    }
}
