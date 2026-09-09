namespace StimesErp.Api.Models
{
    // Matches Setting.ManageSettings(SettingCode, UserCode, CompanyCode, BranchCode, PeriodID, Expire)
    public class SaveUserSettingsRequest
    {
        public int SettingsCode { get; set; } // 0 = insert, matches desktop hdnSettingCode
        public int CompanyCode { get; set; }
        public int BranchCode { get; set; }
        public int PeriodId { get; set; }
    }
}
