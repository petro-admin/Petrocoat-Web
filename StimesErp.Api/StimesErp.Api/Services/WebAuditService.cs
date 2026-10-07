using System.Data;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    // Writes to WebUserAudit - the new, web-only audit trail. Unlike the legacy desktop
    // adminUserAudit table, this one is populated exclusively by this service, called directly
    // at the point of each Add/Edit/Delete across the web app's own services, so every row
    // always carries the real authenticated user and a plain, human-readable module name -
    // no FormCode lookup that can silently fail.
    public class WebAuditService
    {
        private readonly SqlHelper _db;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public WebAuditService(SqlHelper db, IHttpContextAccessor httpContextAccessor)
        {
            _db = db;
            _httpContextAccessor = httpContextAccessor;
        }

        public void LogAdd(string moduleName, string narration, int? branchCode = null) => Log('A', moduleName, narration, branchCode);
        public void LogEdit(string moduleName, string narration, int? branchCode = null) => Log('E', moduleName, narration, branchCode);
        public void LogDelete(string moduleName, string narration, int? branchCode = null) => Log('D', moduleName, narration, branchCode);

        private void Log(char action, string moduleName, string narration, int? branchCode)
        {
            var user = _httpContextAccessor.HttpContext?.User;
            var userCode = int.TryParse(user?.FindFirstValue(ClaimTypes.NameIdentifier), out var uc) ? uc : 0;
            var userName = user?.FindFirstValue(ClaimTypes.Name) ?? "";

            _db.ExecuteNonQuery(
                @"insert into WebUserAudit (UserCode, UserName, Action, ModuleName, Narration, BranchCode)
                  values (@UserCode, @UserName, @Action, @ModuleName, @Narration, @BranchCode)",
                new[]
                {
                    SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                    SqlHelper.Param("@UserName", SqlDbType.VarChar, userName, 100),
                    SqlHelper.Param("@Action", SqlDbType.VarChar, action.ToString(), 1),
                    SqlHelper.Param("@ModuleName", SqlDbType.VarChar, moduleName, 100),
                    SqlHelper.Param("@Narration", SqlDbType.VarChar, narration ?? ""),
                    SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode)
                });
        }
    }
}
