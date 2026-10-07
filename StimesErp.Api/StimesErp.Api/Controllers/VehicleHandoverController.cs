using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using StimesErp.Api.Data;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class VehicleHandoverController : ControllerBase
    {
        private readonly VehicleHandoverService _service;

        public VehicleHandoverController(VehicleHandoverService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("list")]
        public IActionResult GetList([FromQuery] int branchCode) => Ok(_service.GetList(branchCode).ToJsonRows());

        [HttpGet("{code:int}")]
        public IActionResult GetById(int code)
        {
            var hdr = _service.GetHeader(code);
            if (hdr.Rows.Count == 0) return NotFound();
            return Ok(hdr.ToJsonRows()[0]);
        }

        [HttpGet("vehicles")]
        public IActionResult GetVehicles() => Ok(_service.GetVehicles().ToJsonRows());

        [HttpGet("employees")]
        public IActionResult GetEmployees() => Ok(_service.GetEmployeesForHandover().ToJsonRows());

        [HttpGet("generate-docno")]
        public IActionResult GenerateDocNo() => Ok(new { docNo = _service.GenerateDocNo() });

        // Same shared UNC storage convention every other module's upload uses - a redeploy of the
        // API can never wipe a handover photo.
        [HttpPost("upload")]
        [RequestSizeLimit(20_000_000)]
        public async Task<IActionResult> UploadPhoto(IFormFile file, [FromQuery] int branchCode)
        {
            if (file == null || file.Length == 0) return BadRequest(new { message = "No file received." });
            if (file.Length > 20_000_000) return BadRequest(new { message = "File too large (max 20 MB)." });

            var serverPath = _service.GetServerPath(branchCode);
            if (string.IsNullOrWhiteSpace(serverPath))
                return StatusCode(500, new { message = "No server storage path configured for this branch." });

            var folder = Path.Combine(serverPath.TrimEnd('\\', '/'), "VehicleHandover");
            Directory.CreateDirectory(folder);

            var invalid = Path.GetInvalidFileNameChars();
            var safeOriginal = string.Concat(Path.GetFileNameWithoutExtension(file.FileName).Select(c => invalid.Contains(c) ? '_' : c));
            var ext = Path.GetExtension(file.FileName);
            var storedName = $"{safeOriginal}_{Guid.NewGuid():N}{ext}";
            var fullPath = Path.Combine(folder, storedName);

            using (var stream = System.IO.File.Create(fullPath))
            {
                await file.CopyToAsync(stream);
            }

            return Ok(new { fileName = fullPath, originalName = file.FileName });
        }

        [HttpGet("photo")]
        public IActionResult DownloadPhoto([FromQuery] string path)
        {
            // Only ever a UNC path we ourselves wrote via UploadPhoto above.
            if (string.IsNullOrWhiteSpace(path) || !path.StartsWith(@"\\")) return BadRequest();
            if (!System.IO.File.Exists(path)) return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(path, out var contentType))
                contentType = "application/octet-stream";

            var stream = System.IO.File.OpenRead(path);
            return File(stream, contentType);
        }

        [HttpPost("save")]
        public IActionResult Save([FromBody] VehicleHandoverSaveRequest request, [FromQuery] int branchCode)
        {
            var (result, code) = _service.Save(request, CurrentUserCode, branchCode);
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
