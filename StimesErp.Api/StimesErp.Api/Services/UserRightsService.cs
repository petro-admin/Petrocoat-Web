using System.Data;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    /// <summary>
    /// Web equivalent of Stimes.Erp.Library.UserRights.AssignUserRights (backed by
    /// Stimes.Erp.Helper.Security.GetItemSecurity / usp_GetUserRightSecurity) - the same
    /// per-user, per-form Access/Add/Edit/Delete/Search/Approve rights the desktop app's
    /// CheckPermission() reads before enabling Save/New/Delete on a form.
    /// </summary>
    public class UserRightsService
    {
        private readonly SqlHelper _db;

        public UserRightsService(SqlHelper db)
        {
            _db = db;
        }

        public DataTable GetRights(string formClassName, int userCode, int systemCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@tcModuleName", SqlDbType.VarChar, formClassName, 500),
                SqlHelper.Param("@tnUserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@tcAccess", SqlDbType.VarChar, "", 1),
                SqlHelper.Param("@tnSystemCode", SqlDbType.Int, systemCode)
            };
            return _db.GetDataTableFromProcedure("usp_GetUserRightSecurity", p);
        }
    }
}
