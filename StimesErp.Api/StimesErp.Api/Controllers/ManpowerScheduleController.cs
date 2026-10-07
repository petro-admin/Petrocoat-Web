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
    public class ManpowerScheduleController : ControllerBase
    {
        // Matches this.GetType().ToString() in the desktop app's ManpowerSchedule.xaml.cs - the
        // same string the rights-check (usp_GetUserRightSecurity) and the approval-settings lookup
        // (usp_admin_GetApprovalSettingsHDR_By_FormClassName) both key off.
        private const string FormClassName = "Stimes.Erp.App.Win.Production.ManpowerSchedule";

        private readonly ManpowerScheduleService _service;
        private readonly ApprovalService _approval;
        private readonly SettingsService _settings;

        public ManpowerScheduleController(ManpowerScheduleService service, ApprovalService approval, SettingsService settings)
        {
            _service = service;
            _approval = approval;
            _settings = settings;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        private int ResolveModuleCode()
        {
            var dt = _approval.GetApprovalSettingsHeader(FormClassName);
            return dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["ModuleCode"]) : 0;
        }

        [HttpGet("side-list")]
        public IActionResult GetSideList([FromQuery] int periodId)
        {
            return Ok(_service.GetSideList(periodId).ToJsonRows());
        }

        [HttpGet("{id:int}")]
        public IActionResult GetById(int id, [FromQuery] int periodId)
        {
            var hdr = _service.GetHeader(id, periodId);
            if (hdr.Rows.Count == 0) return NotFound();

            return Ok(new
            {
                Header = hdr.ToJsonRows(),
                Lines = _service.GetDtl(id).ToJsonRows(),
                IdleEmployees = _service.GetIdleEmpDtl(id).ToJsonRows()
            });
        }

        [HttpGet("generate-docno")]
        public IActionResult GenerateDocNo([FromQuery] DateTime docDate)
        {
            return Ok(new { docNo = _service.GenerateDocNo(docDate) });
        }

        [HttpGet("lookups")]
        public IActionResult GetLookups()
        {
            return Ok(new
            {
                jobs = _service.GetJobs().ToJsonRows(),
                customers = _service.GetCustomers().ToJsonRows(),
                sources = _service.GetSources().ToJsonRows(),
                shifts = _service.GetShifts().ToJsonRows(),
                employees = _service.GetEmployees().ToJsonRows(),
                supervisors = _service.GetSupervisors().ToJsonRows(),
                drivers = _service.GetDrivers().ToJsonRows(),
                vehicles = _service.GetVehicles().ToJsonRows(),
                idleEmpStatuses = _service.GetIdleEmpStatuses().ToJsonRows()
            });
        }

        [HttpGet("check-existing-employee")]
        public IActionResult CheckExistingEmployee([FromQuery] int code, [FromQuery] DateTime docDate, [FromQuery] int employeeCode)
        {
            return Ok(new { alreadyScheduled = _service.IsEmployeeAlreadyScheduled(code, docDate, employeeCode) });
        }

        [HttpPost("employee-picker-list")]
        public IActionResult GetEmployeePickerList([FromQuery] int code, [FromQuery] DateTime docDate, [FromBody] List<ManpowerScheduleDtlNewRow> currentGrid)
        {
            return Ok(_service.GetEmployeePickerList(code, docDate, currentGrid ?? new()).ToJsonRows());
        }

        [HttpPost("all-selected")]
        public IActionResult GetAllSelectedEmployeeList([FromBody] List<ManpowerScheduleDtlNewRow> data)
        {
            return Ok(_service.GetAllSelectedEmployeeList(data ?? new()).ToJsonRows());
        }

        [HttpPost("idle-employee-checking")]
        public IActionResult GetIdleEmployeeChecking([FromQuery] int code, [FromQuery] DateTime docDate, [FromBody] List<ManpowerScheduleDtlNewRow> currentGrid)
        {
            return Ok(_service.GetIdleEmployeeChecking(code, docDate, currentGrid ?? new()).ToJsonRows());
        }

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
        public IActionResult Save([FromBody] ManpowerScheduleSaveRequest request,
            [FromQuery] int branchCode, [FromQuery] int periodId)
        {
            // Matches desktop's Year.CheckFinanicalPeriod() gate in SaveButton_Click.
            if (!_settings.IsDateInFinancialPeriod(periodId, request.DocDate))
                return BadRequest(new { message = "The required date should be in financial Period." });

            var result = _service.Save(request, branchCode, periodId, CurrentUserCode);
            return Ok(new { result });
        }

        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id, [FromQuery] int branchCode, [FromQuery] int periodId)
        {
            var req = new ManpowerScheduleSaveRequest { Code = id, Mode = 2, DocDate = new DateTime(1900, 1, 1) };
            var result = _service.Save(req, branchCode, periodId, CurrentUserCode);
            return Ok(new { result });
        }
    }
}
