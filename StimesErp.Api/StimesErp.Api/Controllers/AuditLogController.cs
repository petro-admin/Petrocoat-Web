using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Data;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class AuditLogController : ControllerBase
    {
        private readonly AuditLogService _service;

        public AuditLogController(AuditLogService service)
        {
            _service = service;
        }

        [HttpGet("list")]
        public IActionResult GetList(
            [FromQuery] int branchCode,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] int userCode = 0,
            [FromQuery] string action = "",
            [FromQuery] string search = "")
            => Ok(_service.GetList(branchCode, fromDate, toDate, userCode, action, search).ToJsonRows());

        [HttpGet("users")]
        public IActionResult GetUsers([FromQuery] int branchCode) => Ok(_service.GetUsers(branchCode).ToJsonRows());
    }
}
