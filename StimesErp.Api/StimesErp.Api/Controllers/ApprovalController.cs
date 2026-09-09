using System.Data;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Data;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    /// <summary>
    /// Generic Lock/Approve/Deny workflow shared across forms - mirrors the desktop app's
    /// Cls_Authorization/AdminApprovalSettings usage in StoreIndent.xaml.cs (btnLock_Click,
    /// BtnApprove_Click, BTNDeny_Click, FillActions, ApprovalStatusButton_Click).
    /// </summary>
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class ApprovalController : ControllerBase
    {
        private readonly ApprovalService _service;

        public ApprovalController(ApprovalService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("settings")]
        public IActionResult GetSettings([FromQuery] string formClassName)
        {
            var dt = _service.GetApprovalSettingsHeader(formClassName);
            return Ok(new
            {
                isApproval = dt.Rows.Count > 0,
                moduleCode = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["ModuleCode"]) : 0
            });
        }

        [HttpGet("status")]
        public IActionResult GetStatus([FromQuery] int moduleCode, [FromQuery] int transactionCode)
        {
            var check = _service.GetCheck(moduleCode, transactionCode, CurrentUserCode);
            if (check.Rows.Count == 0) return Ok(new { visible = false });

            var action = _service.GetActionStatus(moduleCode, transactionCode, CurrentUserCode);
            return Ok(new
            {
                visible = true,
                action = action.ToJsonRows().FirstOrDefault()
            });
        }

        [HttpPost("action")]
        public IActionResult ManageAction([FromBody] ApprovalActionRequest request)
        {
            var result = _service.ManageFormApprovals(request.ModuleCode, request.TransactionCode, CurrentUserCode, request.Activity, request.Action, request.Comment);
            return Ok(new { result });
        }

        [HttpGet("history")]
        public IActionResult GetHistory([FromQuery] int moduleCode, [FromQuery] int transactionCode)
        {
            var ds = _service.GetApprovalStatusAndHistory(moduleCode, transactionCode, CurrentUserCode);
            return Ok(ds.Tables.Cast<DataTable>().Select(table => table.ToJsonRows()).ToArray());
        }

        // Checks whether another user has already taken an approval action on this record -
        // matches the "Some other users took action..." conflict dialog before Save/Delete.
        [HttpGet("verify")]
        public IActionResult Verify([FromQuery] string formClassName, [FromQuery] int transactionCode)
        {
            var count = _service.VerifyTransactionWithApprovalStatus(formClassName, transactionCode, "CNT");
            return Ok(new { count = int.TryParse(count, out var n) ? n : 0 });
        }

        // Clears all prior approval actions on this record so it can be edited/deleted -
        // matches the desktop's "Do you want to delete all actions over this file?" flow.
        [HttpPost("clear-actions")]
        public IActionResult ClearActions([FromQuery] string formClassName, [FromQuery] int transactionCode, [FromQuery] int moduleCode)
        {
            var verify = _service.VerifyTransactionWithApprovalStatus(formClassName, transactionCode, "DLT");
            if (verify != "DELETED") return Ok(new { result = "Transaction Failed..." });

            _service.DeleteRequestAndActionStatus(transactionCode, moduleCode);
            return Ok(new { result = "All Actions Over These File Deleted.." });
        }
    }
}
