using System.Data;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    /// <summary>
    /// Web equivalent of Stimes.Erp.Library.CompanyMasterDetails / BranchMaster / CommonHelper / Setting / Year -
    /// calls the exact same stored procedures the desktop app's Quick Settings panel
    /// (MainWindow.xaml.cs: FillCompany / FillBranches / FillFinancialPeriod / GetSettings / SaveSettings) uses.
    /// </summary>
    public class SettingsService
    {
        private readonly SqlHelper _db;

        public SettingsService(SqlHelper db)
        {
            _db = db;
        }

        // CompanyMasterDetails.GetCompanyTable(0, "", "")
        public DataTable GetCompanies()
        {
            var p = new[]
            {
                SqlHelper.Param("@tnCompanyCode", SqlDbType.Int, 0),
                SqlHelper.Param("@tcSearchtext", SqlDbType.VarChar, "", 5000),
                SqlHelper.Param("@tcSearchCriteria", SqlDbType.VarChar, "", 5000)
            };
            return _db.GetDataTableFromProcedure("usp_Payroll_GetCompanyMaster", p);
        }

        // BranchMaster.GetBranchMaster() - BranchCode=0 returns all branches for the company
        public DataTable GetBranches(int companyCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@tnBranchCode", SqlDbType.Int, 0),
                SqlHelper.Param("@tnCompanyCode", SqlDbType.Int, companyCode)
            };
            return _db.GetDataTableFromProcedure("usp_admin_GetBranchInfo", p);
        }

        // CommonHelper.GetFinancialPeriod() - PeriodID=0 returns all periods, non-zero returns just that one
        public DataTable GetFinancialPeriods(int periodId = 0)
        {
            var p = new[] { SqlHelper.Param("@tnPeriodID", SqlDbType.Int, periodId) };
            return _db.GetDataTableFromProcedure("usp_GetFinancialPeriod", p);
        }

        // Setting.GetSettngs(SettingCode, UserCode)
        public DataTable GetUserSettings(int userCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@tnSettingCode", SqlDbType.Int, 0),
                SqlHelper.Param("@tnUserCode", SqlDbType.Int, userCode)
            };
            return _db.GetDataTableFromProcedure("usp_GetSettings", p);
        }

        // Setting.ManageSettings(SettingCode, UserCode, CompanyCode, BranchCode, PeriodID, Expire)
        public string SaveUserSettings(int settingsCode, int userCode, int companyCode, int branchCode, int periodId)
        {
            var p = new[]
            {
                SqlHelper.Param("@tnSettingCode", SqlDbType.Int, settingsCode),
                SqlHelper.Param("@tnUserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@tnCompanyCode", SqlDbType.Int, companyCode),
                SqlHelper.Param("@tnBranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@tnPeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@tcExpire", SqlDbType.VarChar, "", 100)
            };
            return _db.DataTransactionsByProcedure("usp_ManageSettings", p);
        }

        // Year.CheckFinanicalPeriod(PeriodId, Fdate) - same gate SaveSettings() runs before persisting
        public bool IsDateInFinancialPeriod(int periodId, DateTime date)
        {
            var p = new[]
            {
                SqlHelper.Param("@tnPeriodID", SqlDbType.Int, periodId),
                SqlHelper.Param("@tnFdate", SqlDbType.DateTime, date)
            };
            return _db.GetDataTableFromProcedure("usp_CheckFinancialPeriod", p).Rows.Count > 0;
        }
    }
}
