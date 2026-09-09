using System.Data;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    /// <summary>
    /// Web equivalent of the desktop app's shared approval/authorization subsystem
    /// (Cls_Authorization, AdminApprovalSettings, Payroll_Appreciation's approval methods).
    /// Used by any form that has Lock/Approve/Deny wired up (StoreIndent.xaml.cs is the first
    /// one ported) - generic by design, parameterized by ModuleCode/TransactionCode/FormClassName
    /// exactly like the desktop classes, so other forms can reuse it later.
    /// </summary>
    public class ApprovalService
    {
        private readonly SqlHelper _db;

        public ApprovalService(SqlHelper db)
        {
            _db = db;
        }

        // Payroll_Appreciation.GetApprovalSettingsHDR_By_FormClassName - non-empty result means
        // this form has approval configured (ISApprove_userandform in the desktop app).
        public DataTable GetApprovalSettingsHeader(string formClassName)
        {
            var p = new[] { SqlHelper.Param("@FormClassName", SqlDbType.VarChar, formClassName, 500) };
            return _db.GetDataTableFromProcedure("usp_admin_GetApprovalSettingsHDR_By_FormClassName", p);
        }

        // Cls_Authorization.GetActionStatus - lock state, created/modified/approved by, current status.
        public DataTable GetActionStatus(int moduleCode, int transactionCode, int userCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@ModuleCode", SqlDbType.Int, moduleCode),
                SqlHelper.Param("@TransactionCode", SqlDbType.Int, transactionCode),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
            };
            return _db.GetDataTableFromProcedure("usp_admin_GetActionStatus", p);
        }

        // Cls_Authorization.GetCHECK - whether this user/module/transaction combination should
        // show the approval panel at all.
        public DataTable GetCheck(int moduleCode, int transactionCode, int userCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@ModuleCode", SqlDbType.Int, moduleCode),
                SqlHelper.Param("@TransactionCode", SqlDbType.Int, transactionCode),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
            };
            return _db.GetDataTableFromProcedure("usp_admin_GetCheckApproval", p);
        }

        // AdminApprovalSettings.ManageFormApprovals - used for both Lock/Unlock (Activity "L")
        // and Approve/Deny (Activity "A").
        public string ManageFormApprovals(int moduleCode, int transactionCode, int userCode, string activity, string action, string comment)
        {
            var p = new[]
            {
                SqlHelper.Param("@ModuleCode", SqlDbType.Int, moduleCode),
                SqlHelper.Param("@transactionCode", SqlDbType.Int, transactionCode),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@Activity", SqlDbType.VarChar, activity, 50),
                SqlHelper.Param("@Action", SqlDbType.VarChar, action, 50),
                SqlHelper.Param("@Comment", SqlDbType.VarChar, comment ?? "", 1000)
            };
            return _db.DataTransactionsByProcedure("[usp_ManageAction]", p);
        }

        // Payroll_Appreciation.VerifyTransactionWithApprovalStatus - "CNT" to count other users'
        // pending actions on this record before save/delete, "DLT" to force-clear them.
        public string VerifyTransactionWithApprovalStatus(string formClassName, int transactionCode, string actionName)
        {
            var p = new[]
            {
                SqlHelper.Param("@FormClassName", SqlDbType.VarChar, formClassName, 500),
                SqlHelper.Param("@TransactionCode", SqlDbType.Int, transactionCode),
                SqlHelper.Param("@Action", SqlDbType.VarChar, actionName, 3)
            };
            return _db.DataTransactionsByProcedure("usp_admin_VerifyTransactionWithApprovalStatus", p);
        }

        // Cls_Authorization.DeleteDeleteRequestAndActionStatus
        public string DeleteRequestAndActionStatus(int transactionCode, int moduleCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@TransactionCode", SqlDbType.Int, transactionCode),
                SqlHelper.Param("@ModuleCode", SqlDbType.Int, moduleCode)
            };
            return _db.DataTransactionsByProcedure("usp_admin_DeleteRequestAndActionStatus", p);
        }

        // Cls_Authorization.GetApprovalStatus_and_History - feeds the "View Action History" dialog.
        public DataSet GetApprovalStatusAndHistory(int moduleCode, int transactionCode, int userCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@ModuleCode", SqlDbType.Int, moduleCode),
                SqlHelper.Param("@TransactionCode", SqlDbType.Int, transactionCode),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode)
            };
            return _db.GetDataSetFromProcedure("usp_admin_GetApprovalStatus_and_History", p);
        }
    }
}
