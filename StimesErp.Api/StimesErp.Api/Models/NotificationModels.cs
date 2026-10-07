namespace StimesErp.Api.Models
{
    // Web-only admin screen - no desktop equivalent. Structured after the desktop's own Approval
    // Settings screen (System -> Module -> Form picker, one settings row per FormClassName), but
    // the detail grid is a flat "who to notify" user list instead of Approval Settings' priority
    // chain (AND/OR between User1/User2), since notification fan-out has no such concept.
    public class NotificationSettingsSaveRequest
    {
        public int Code { get; set; } // 0 = new
        public string FormClassName { get; set; } = string.Empty;
        public string FormName { get; set; } = string.Empty;
        public int SystemCode { get; set; }
        public int ModuleTypeCode { get; set; }
        public int ModuleCode { get; set; }

        public bool OnCreate { get; set; }
        public bool OnUpdate { get; set; }
        public bool OnDelete { get; set; }
        public bool OnApprove { get; set; }
        public bool OnDeny { get; set; }

        public bool Active { get; set; } = true;
        public List<int> UserCodes { get; set; } = new();
    }
}
