using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Data;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class DSRTimeSheetController : ControllerBase
    {
        // The desktop's own exact class name (Payroll System, ModuleCode 360, already registered
        // in AdminModuleInfo with real rights configured) - using this exact string, not a new
        // web-only one, means existing rights/approval configuration applies unchanged.
        private const string FormClassName = "Stimes.Erp.App.Win.Payroll_System.DSRDailyTimeSheet";

        private readonly DSRTimeSheetService _service;
        private readonly ApprovalService _approval;

        public DSRTimeSheetController(DSRTimeSheetService service, ApprovalService approval)
        {
            _service = service;
            _approval = approval;
        }

        private int ResolveModuleCode()
        {
            var dt = _approval.GetApprovalSettingsHeader(FormClassName);
            return dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["ModuleCode"]) : 0;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("list")]
        public IActionResult GetList([FromQuery] int periodId, [FromQuery] int monthCode = 0) =>
            Ok(_service.GetList(periodId, monthCode).ToJsonRows());

        [HttpGet("{code:int}")]
        public IActionResult GetById(int code)
        {
            var hdr = _service.GetHeader(code);
            if (hdr.Rows.Count == 0) return NotFound();
            return Ok(new
            {
                Header = hdr.ToJsonRows()[0],
                Lines = _service.GetLines(code).ToJsonRows(),
                JobSummary = _service.GetJobSummary(code).ToJsonRows()
            });
        }

        [HttpGet("load-from-daily-site")]
        public IActionResult LoadFromDailySite([FromQuery] DateTime date, [FromQuery] int periodId, [FromQuery] int branchCode) =>
            Ok(_service.LoadFromDailySite(date, periodId, branchCode).ToJsonRows());

        [HttpGet("attendance-statuses")]
        public IActionResult GetAttendanceStatuses() => Ok(_service.GetAttendanceStatuses().ToJsonRows());

        [HttpGet("standard-hours")]
        public IActionResult GetStandardHours([FromQuery] int employeeCode, [FromQuery] int branchCode, [FromQuery] string category) =>
            Ok(new { hours = _service.GetStandardHours(employeeCode, branchCode, category) });

        [HttpGet("is-holiday")]
        public IActionResult IsHoliday([FromQuery] DateTime date, [FromQuery] int branchCode) =>
            Ok(new { isHoliday = _service.IsHoliday(date, branchCode) });

        [HttpGet("generate-docno")]
        public IActionResult GenerateDocNo() => Ok(new { dsrNumber = _service.GenerateDocNo() });

        [HttpGet("approval-settings")]
        public IActionResult GetApprovalSettings()
        {
            var dt = _approval.GetApprovalSettingsHeader(FormClassName);
            return Ok(new
            {
                isApproval = dt.Rows.Count > 0,
                moduleCode = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["ModuleCode"]) : 0,
                formClassName = FormClassName
            });
        }

        [HttpPost("save")]
        public IActionResult Save([FromBody] DSRTimeSheetSaveRequest request)
        {
            var (result, dsrCode) = _service.Save(request, CurrentUserCode);
            return Ok(new { result, dsrCode });
        }

        [HttpDelete("{code:int}")]
        public IActionResult Delete(int code)
        {
            var result = _service.Delete(code);
            return Ok(new { result });
        }
    }
}
