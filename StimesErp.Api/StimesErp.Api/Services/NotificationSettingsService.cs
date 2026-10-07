using System.Data;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    // Admin configuration side of the notification system - who gets notified, for which
    // form, on which events. The System -> ModuleType -> Form cascading picker calls the exact
    // same stored procedures the desktop's own ApprovalSettings.xaml.cs uses to populate its
    // ddlSystem/ddlModule/acbForm combos (usp_GetAllSystem/usp_GetModuleType/usp_GetModuleInfo) -
    // same real data, not a reinvented query. A picked Form row's AdminModuleInfo.FormShortName
    // is the FormClassName stored here and matched against at trigger time (NotificationService) -
    // the same column ApprovalService/UserRightsService already key off, not ModuleCode, since the
    // same form can appear under more than one ModuleCode (different menu placements).
    public class NotificationSettingsService
    {
        private readonly SqlHelper _db;

        public NotificationSettingsService(SqlHelper db)
        {
            _db = db;
        }

        public DataTable GetSystems() => _db.GetDataTableFromProcedure("usp_GetAllSystem",
            new[]
            {
                SqlHelper.Param("@tcSearchtext", SqlDbType.VarChar, "", 4000),
                SqlHelper.Param("@tcSearchCriteria", SqlDbType.VarChar, "", 4000)
            });

        public DataTable GetModuleTypes() => _db.GetDataTableFromProcedure("usp_GetModuleType",
            new[] { SqlHelper.Param("@tnModuleTypeCode", SqlDbType.Int, 0) });

        public DataTable GetForms(int systemCode, int moduleTypeCode) => _db.GetDataTableFromProcedure("usp_GetModuleInfo",
            new[]
            {
                SqlHelper.Param("@tnModuleCode", SqlDbType.Int, 0),
                SqlHelper.Param("@tnSystemCode", SqlDbType.Int, systemCode),
                SqlHelper.Param("@tnModuleTypeCode", SqlDbType.Int, moduleTypeCode)
            });

        public DataTable GetUsers() => _db.GetDataTableFromQuery(
            "select UserCode, UserName from AdminUserMaster where ActiveYesNo = 'Y' order by UserName");

        public DataTable GetList() => _db.GetDataTableFromQuery(
            @"select Code, FormClassName, FormName, SystemCode, ModuleTypeCode, ModuleCode,
                     OnCreate, OnUpdate, OnDelete, OnApprove, OnDeny, Active,
                     (select count(*) from NotificationSettingsUser U where U.HdrCode = H.Code) as UserCount
              from NotificationSettingsHdr H
              order by FormName");

        public DataTable GetHeader(int code) => _db.GetDataTableFromQuery(
            @"select Code, FormClassName, FormName, SystemCode, ModuleTypeCode, ModuleCode,
                     OnCreate, OnUpdate, OnDelete, OnApprove, OnDeny, Active
              from NotificationSettingsHdr where Code = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        public DataTable GetUserCodes(int code) => _db.GetDataTableFromQuery(
            "select UserCode from NotificationSettingsUser where HdrCode = @Code",
            new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        // One settings row per FormClassName (matches Approval Settings' own one-row-per-form
        // convention) - saving a form that already has a row updates it instead of duplicating.
        public (string Result, int Code) Save(NotificationSettingsSaveRequest req, int userCode)
        {
            var existing = _db.GetDataTableFromQuery(
                "select Code from NotificationSettingsHdr where FormClassName = @FormClassName and Code <> @Code",
                new[]
                {
                    SqlHelper.Param("@FormClassName", SqlDbType.VarChar, req.FormClassName, 500),
                    SqlHelper.Param("@Code", SqlDbType.Int, req.Code)
                });
            if (existing.Rows.Count > 0)
                return ("This form already has notification settings - edit that entry instead.", 0);

            int code;
            if (req.Code > 0)
            {
                _db.ExecuteNonQuery(
                    @"update NotificationSettingsHdr set
                        FormClassName = @FormClassName, FormName = @FormName, SystemCode = @SystemCode,
                        ModuleTypeCode = @ModuleTypeCode, ModuleCode = @ModuleCode,
                        OnCreate = @OnCreate, OnUpdate = @OnUpdate, OnDelete = @OnDelete,
                        OnApprove = @OnApprove, OnDeny = @OnDeny, Active = @Active
                      where Code = @Code",
                    Params(req));
                code = req.Code;
                _db.ExecuteNonQuery("delete from NotificationSettingsUser where HdrCode = @Code",
                    new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });
            }
            else
            {
                var dt = _db.GetDataTableFromQuery(
                    @"insert into NotificationSettingsHdr
                        (FormClassName, FormName, SystemCode, ModuleTypeCode, ModuleCode,
                         OnCreate, OnUpdate, OnDelete, OnApprove, OnDeny, Active, CreatedBy)
                      output inserted.Code
                      values
                        (@FormClassName, @FormName, @SystemCode, @ModuleTypeCode, @ModuleCode,
                         @OnCreate, @OnUpdate, @OnDelete, @OnApprove, @OnDeny, @Active, @CreatedBy)",
                    Params(req).Append(SqlHelper.Param("@CreatedBy", SqlDbType.Int, userCode)).ToArray());
                code = Convert.ToInt32(dt.Rows[0]["Code"]);
            }

            foreach (var uc in req.UserCodes.Distinct())
            {
                _db.ExecuteNonQuery(
                    "insert into NotificationSettingsUser (HdrCode, UserCode) values (@HdrCode, @UserCode)",
                    new[] { SqlHelper.Param("@HdrCode", SqlDbType.Int, code), SqlHelper.Param("@UserCode", SqlDbType.Int, uc) });
            }

            return ("Saved Successfully", code);
        }

        public void Delete(int code) =>
            _db.ExecuteNonQuery("delete from NotificationSettingsHdr where Code = @Code",
                new[] { SqlHelper.Param("@Code", SqlDbType.Int, code) });

        private static SqlParameter[] Params(NotificationSettingsSaveRequest req) => new[]
        {
            SqlHelper.Param("@Code", SqlDbType.Int, req.Code),
            SqlHelper.Param("@FormClassName", SqlDbType.VarChar, req.FormClassName, 500),
            SqlHelper.Param("@FormName", SqlDbType.VarChar, req.FormName, 100),
            SqlHelper.Param("@SystemCode", SqlDbType.Int, req.SystemCode),
            SqlHelper.Param("@ModuleTypeCode", SqlDbType.Int, req.ModuleTypeCode),
            SqlHelper.Param("@ModuleCode", SqlDbType.Int, req.ModuleCode),
            SqlHelper.Param("@OnCreate", SqlDbType.Bit, req.OnCreate),
            SqlHelper.Param("@OnUpdate", SqlDbType.Bit, req.OnUpdate),
            SqlHelper.Param("@OnDelete", SqlDbType.Bit, req.OnDelete),
            SqlHelper.Param("@OnApprove", SqlDbType.Bit, req.OnApprove),
            SqlHelper.Param("@OnDeny", SqlDbType.Bit, req.OnDeny),
            SqlHelper.Param("@Active", SqlDbType.Char, req.Active ? "Y" : "N", 1)
        };
    }
}
