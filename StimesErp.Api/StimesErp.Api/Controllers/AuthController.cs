using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _authService;
        private readonly JwtTokenService _jwt;

        public AuthController(AuthService authService, JwtTokenService jwt)
        {
            _authService = authService;
            _jwt = jwt;
        }

        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            var result = _authService.Login(request.Username, request.Password);

            if (result.MaintenanceMode)
                return StatusCode(503, new { message = result.ErrorMessage ?? "System is under maintenance" });

            if (!result.Success)
                return Unauthorized(new { message = result.ErrorMessage ?? "Invalid Username or Password" });

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
