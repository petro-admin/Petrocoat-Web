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
    public class SettingsController : ControllerBase
    {
        private readonly SettingsService _service;

        public SettingsController(SettingsService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("companies")]
        public IActionResult GetCompanies() => Ok(_service.GetCompanies().ToJsonRows());

        [HttpGet("branches")]
        public IActionResult GetBranches([FromQuery] int companyCode) => Ok(_service.GetBranches(companyCode).ToJsonRows());

        [HttpGet("financial-periods")]
        public IActionResult GetFinancialPeriods([FromQuery] int periodId = 0) => Ok(_service.GetFinancialPeriods(periodId).ToJsonRows());

        [HttpGet("my-settings")]
        public IActionResult GetMySettings() => Ok(_service.GetUserSettings(CurrentUserCode).ToJsonRows());

        [HttpPost("my-settings")]
        public IActionResult SaveMySettings([FromBody] SaveUserSettingsRequest request)
        {
            if (!_service.IsDateInFinancialPeriod(request.PeriodId, DateTime.Now))
                return BadRequest(new { message = "The Processing date should be in financial period." });

            var result = _service.SaveUserSettings(request.SettingsCode, CurrentUserCode, request.CompanyCode, request.BranchCode, request.PeriodId);
            return Ok(new { result });
        }
    }
}
