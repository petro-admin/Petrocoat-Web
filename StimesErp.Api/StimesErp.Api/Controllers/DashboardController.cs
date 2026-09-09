using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class DashboardController : ControllerBase
    {
        // AdminUserCategoryInfo.UserCategoryCode: 1 = ADMIN, 3 = POWER USER, 6 = USER.
        // This admin KPI dashboard is restricted to category 1 only.
        private const int AdminUserCategoryCode = 1;

        private readonly DashboardService _service;

        public DashboardController(DashboardService service)
        {
            _service = service;
        }

        private bool IsAdmin =>
            int.Parse(User.FindFirstValue("UCatCode") ?? "0") == AdminUserCategoryCode;

        [HttpGet("branches")]
        public IActionResult GetBranches()
        {
            if (!IsAdmin) return Forbid();
            return Ok(_service.GetBranches());
        }

        [HttpGet("departments")]
        public IActionResult GetDepartments()
        {
            if (!IsAdmin) return Forbid();
            return Ok(_service.GetDepartments());
        }

        [HttpGet("kpis")]
        public IActionResult GetKpis([FromQuery] DateTime fromDate, [FromQuery] DateTime toDate, [FromQuery] string? branchCode, [FromQuery] int? departmentCode)
        {
            if (!IsAdmin) return Forbid();
            var result = _service.GetKpis(fromDate, toDate, branchCode, departmentCode);
            return Ok(result);
        }
    }
}
