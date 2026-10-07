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
    public class NotificationSettingsController : ControllerBase
    {
        private readonly NotificationSettingsService _service;

        public NotificationSettingsController(NotificationSettingsService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("systems")]
        public IActionResult GetSystems() => Ok(_service.GetSystems().ToJsonRows());

        [HttpGet("module-types")]
        public IActionResult GetModuleTypes() => Ok(_service.GetModuleTypes().ToJsonRows());

        [HttpGet("forms")]
        public IActionResult GetForms([FromQuery] int systemCode, [FromQuery] int moduleTypeCode) =>
            Ok(_service.GetForms(systemCode, moduleTypeCode).ToJsonRows());

        [HttpGet("users")]
        public IActionResult GetUsers() => Ok(_service.GetUsers().ToJsonRows());

        [HttpGet("list")]
        public IActionResult GetList() => Ok(_service.GetList().ToJsonRows());

        [HttpGet("{code:int}")]
        public IActionResult GetById(int code)
        {
            var hdr = _service.GetHeader(code);
            if (hdr.Rows.Count == 0) return NotFound();

            return Ok(new
            {
                Header = hdr.ToJsonRows()[0],
                UserCodes = _service.GetUserCodes(code).ToJsonRows()
            });
        }

        [HttpPost("save")]
        public IActionResult Save([FromBody] NotificationSettingsSaveRequest request)
        {
            var (result, code) = _service.Save(request, CurrentUserCode);
            return Ok(new { result, code });
        }

        [HttpDelete("{code:int}")]
        public IActionResult Delete(int code)
        {
            _service.Delete(code);
            return Ok(new { result = "Deleted Successfully" });
        }
    }
}
