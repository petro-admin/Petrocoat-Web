using System.Data;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    // Reads WebUserAudit only - the new web-only audit trail written by WebAuditService.
    // Deliberately independent of the legacy desktop adminUserAudit table (which has a
    // separate, unfixable data-quality bug: most historical rows never captured a real
    // UserCode or FormCode) - this view never joins to or shows any desktop-originated data.
    public class AuditLogService
    {
        private readonly SqlHelper _db;

        public AuditLogService(SqlHelper db)
        {
            _db = db;
        }

        public DataTable GetList(int branchCode, DateTime? fromDate, DateTime? toDate, int userCode, string action, string search)
        {
            var p = new[]
            {
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@FromDate", SqlDbType.DateTime, fromDate),
                SqlHelper.Param("@ToDate", SqlDbType.DateTime, toDate),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@Action", SqlDbType.VarChar, action ?? "", 10),
                SqlHelper.Param("@Search", SqlDbType.VarChar, search ?? "", 200)
            };

            // Capped at the most recent 500 rows - the date/user/action/search filters narrow
            // it down from there, same convention as every other list report in this app.
            return _db.GetDataTableFromQuery(
                @"select top 500
                         GenCode, AuditDate, Action, Narration, UserName, ModuleName, BranchCode
                  from WebUserAudit
                  where (@BranchCode = 0 or BranchCode = @BranchCode or BranchCode is null)
                    and (@FromDate is null or AuditDate >= @FromDate)
                    and (@ToDate is null or AuditDate < DATEADD(day, 1, @ToDate))
                    and (@UserCode = 0 or UserCode = @UserCode)
                    and (@Action = '' or Action = @Action)
                    and (@Search = '' or Narration like '%' + @Search + '%' or ModuleName like '%' + @Search + '%')
                  order by AuditDate desc, GenCode desc",
                p);
        }

        public DataTable GetUsers(int branchCode) => _db.GetDataTableFromQuery(
            @"select distinct UserCode, UserName
              from WebUserAudit
              where (@BranchCode = 0 or BranchCode = @BranchCode)
              order by UserName",
            new[] { SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode) });
    }
}
