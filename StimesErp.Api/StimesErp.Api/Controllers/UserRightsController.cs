using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class UserRightsController : ControllerBase
    {
        // Matches StaticClass.MainModuleCode's constructor default (Stimes.Erp.App.Win\StaticClass.cs) -
        // the desktop app overrides this per-module for a few specific forms, but Purchase\StoreIndent.xaml.cs
        // never does, so it always reads rights under this default system code.
        private const int DefaultSystemCode = 6;

        private readonly UserRightsService _service;

        public UserRightsController(UserRightsService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet]
        public IActionResult GetRights([FromQuery] string formClassName)
        {
            var dt = _service.GetRights(formClassName, CurrentUserCode, DefaultSystemCode);

            // No row for this user/form = every flag defaults false, same as the desktop's
            // UserRights class (its bool fields simply never get set when dtUserRights is empty).
            bool Flag(string col) => dt.Rows.Count > 0 && dt.Rows[0][col]?.ToString() == "Y";

            return Ok(new
            {
                access = Flag("AccessYesNo"),
                add = Flag("AddYesNo"),
                edit = Flag("EditYesNo"),
                delete = Flag("DeleteYesNo"),
                search = Flag("SearchYesNo"),
                approve = Flag("ApproveYesNo")
            });
        }
    }
}
