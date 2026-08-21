using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _authService;
        private readonly IConfiguration _config;

        public AuthController(AuthService authService, IConfiguration config)
        {
            _authService = authService;
            _config = config;
        }

        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            var result = _authService.Login(request.Username, request.Password);

            if (result.MaintenanceMode)
                return StatusCode(503, new { message = result.ErrorMessage ?? "System is under maintenance" });

            if (!result.Success)
                return Unauthorized(new { message = result.ErrorMessage ?? "Invalid Username or Password" });

            var token = GenerateJwt(result.UserCode, result.UserName, result.UCatCode);

            return Ok(new LoginResponse
            {
                Token = token,
                UserCode = result.UserCode,
                UserName = result.UserName,
                UCatCode = result.UCatCode
            });
        }

        private string GenerateJwt(int userCode, string userName, int uCatCode)
        {
            var jwtSection = _config.GetSection("Jwt");
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSection["Key"]!));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, userCode.ToString()),
                new Claim(ClaimTypes.Name, userName),
                new Claim("UCatCode", uCatCode.ToString())
            };

            var token = new JwtSecurityToken(
                issuer: jwtSection["Issuer"],
                audience: jwtSection["Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(double.Parse(jwtSection["ExpiryMinutes"]!)),
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
