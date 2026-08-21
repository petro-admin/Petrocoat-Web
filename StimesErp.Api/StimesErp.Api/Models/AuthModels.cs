namespace StimesErp.Api.Models
{
    public class LoginRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class LoginResponse
    {
        public string Token { get; set; } = string.Empty;
        public int UserCode { get; set; }
        public string UserName { get; set; } = string.Empty;
        public int UCatCode { get; set; }
    }
}
