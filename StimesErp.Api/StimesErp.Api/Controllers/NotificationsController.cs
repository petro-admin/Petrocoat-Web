using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Data;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    // The delivery/bell-panel side every logged-in user hits, as opposed to
    // NotificationSettingsController which only an admin configuring the system uses.
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class NotificationsController : ControllerBase
    {
        private readonly NotificationService _service;

        public NotificationsController(NotificationService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("mine")]
        public IActionResult GetMine([FromQuery] bool unreadOnly = false) =>
            Ok(_service.GetMine(CurrentUserCode, unreadOnly).ToJsonRows());

        [HttpGet("unread-count")]
        public IActionResult GetUnreadCount() => Ok(new { count = _service.GetUnreadCount(CurrentUserCode) });

        [HttpPost("{code:int}/read")]
        public IActionResult MarkRead(int code)
        {
            _service.MarkRead(code, CurrentUserCode);
            return Ok();
        }

        [HttpPost("read-all")]
        public IActionResult MarkAllRead()
        {
            _service.MarkAllRead(CurrentUserCode);
            return Ok();
        }
    }
}
