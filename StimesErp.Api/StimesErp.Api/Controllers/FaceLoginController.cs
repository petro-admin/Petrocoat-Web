using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    // No [Authorize] anywhere on this controller - this IS the login mechanism, so by definition
    // it has to be reachable before anyone is signed in (same reasoning the old WebAuthn login
    // endpoints documented).
    [ApiController]
    [Route("[controller]")]
    public class FaceLoginController : ControllerBase
    {
        private readonly FaceLoginService _service;
        private readonly JwtTokenService _jwt;

        public FaceLoginController(FaceLoginService service, JwtTokenService jwt)
        {
            _service = service;
            _jwt = jwt;
        }

        [HttpGet("descriptors")]
        public IActionResult GetDescriptors() => Ok(_service.GetDescriptors());

        [HttpPost("complete")]
        public IActionResult Complete([FromBody] FaceLoginCompleteRequest request)
        {
            var result = _service.TryCompleteLogin(request.EmployeeCode, request.ConfidencePercent);
            if (result == null)
                return Unauthorized(new { message = "Face not recognized. Please use your password." });

            var token = _jwt.GenerateJwt(result.UserCode, result.UserName, result.UCatCode, result.EmpCode);

            return Ok(new LoginResponse
            {
                Token = token,
                UserCode = result.UserCode,
                UserName = result.UserName,
                UCatCode = result.UCatCode,
                EmpCode = result.EmpCode
            });
        }
    }
}
