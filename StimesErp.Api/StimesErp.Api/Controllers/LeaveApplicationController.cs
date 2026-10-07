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
    public class LeaveApplicationController : ControllerBase
    {
        // Matches this.GetType().ToString() in the desktop app's convention exactly - the same
        // string desktop's LeaveApplicationForm uses, so records/approval workflow/permissions
        // stay fully shared between the two apps (AdminModuleInfo ModuleCode 205, already registered).
        private const string FormClassName = "Stimes.Erp.App.Win.Payroll_System.LeaveApplicationForm";

        private readonly LeaveApplicationService _service;

        public LeaveApplicationController(LeaveApplicationService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("generate-docno")]
        public IActionResult GenerateDocNo() => Ok(new { requestNo = _service.GetNextDocNo() });

        [HttpGet("leave-types")]
        public IActionResult GetLeaveTypes() => Ok(_service.GetLeaveTypes().ToJsonRows());

        [HttpGet("employees")]
        public IActionResult GetEmployees() => Ok(_service.GetEmployees().ToJsonRows());

        [HttpGet("available-balance")]
        public IActionResult GetAvailableBalance([FromQuery] int employeeCode, [FromQuery] int requestTypeCode, [FromQuery] DateTime? asOnDate) =>
            Ok(_service.GetAvailableLeaveDays(employeeCode, requestTypeCode, asOnDate ?? DateTime.UtcNow).ToJsonRows().FirstOrDefault());

        [HttpGet("validate-dates")]
        public IActionResult ValidateDates([FromQuery] int employeeCode, [FromQuery] DateTime fromDate, [FromQuery] DateTime toDate, [FromQuery] int mode) =>
            Ok(new { duplicate = _service.ValidateDates(employeeCode, fromDate, toDate, mode).Rows.Count > 0 });

        [HttpGet("list")]
        public IActionResult GetList([FromQuery] int year) =>
            Ok(_service.GetList(FormClassName, year == 0 ? 0 : year % 100).ToJsonRows());

        [HttpGet("{requestId:int}")]
        public IActionResult GetById(int requestId)
        {
            var dt = _service.GetById(FormClassName, requestId);
            if (dt.Rows.Count == 0) return NotFound();
            return Ok(dt.ToJsonRows()[0]);
        }

        // Same shared network path convention as Vehicle Service/Repair's document upload
        // (payrollSettings.ServerPath) - survives redeploys, matches desktop's own file storage.
        [HttpPost("upload")]
        [RequestSizeLimit(20_000_000)]
        public async Task<IActionResult> UploadDocument(IFormFile file, [FromQuery] int branchCode)
        {
            if (file == null || file.Length == 0) return BadRequest(new { message = "No file received." });
            if (file.Length > 20_000_000) return BadRequest(new { message = "File too large (max 20 MB)." });

            var serverPath = _service.GetServerPath(branchCode);
            if (string.IsNullOrWhiteSpace(serverPath))
                return StatusCode(500, new { message = "No server storage path configured for this branch." });

            var folder = Path.Combine(serverPath.TrimEnd('\\', '/'), "LeaveApplication");
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

        [HttpGet("documents")]
        public IActionResult DownloadDocument([FromQuery] string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !path.StartsWith(@"\\")) return BadRequest();
            if (!System.IO.File.Exists(path)) return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(path, out var contentType))
                contentType = "application/octet-stream";

            var stream = System.IO.File.OpenRead(path);
            return File(stream, contentType, Path.GetFileName(path));
        }

        [HttpPost("save")]
        public IActionResult Save([FromBody] LeaveApplicationSaveRequest request, [FromQuery] int periodId, [FromQuery] int branchCode, [FromQuery] int companyCode)
        {
            var mode = request.RequestId > 0 ? 1 : 0;
            var result = _service.Save(request, mode, CurrentUserCode, periodId, branchCode, companyCode, FormClassName);
            return Ok(new { result });
        }

        [HttpDelete("{requestId:int}")]
        public IActionResult Delete(int requestId, [FromQuery] string requestNo, [FromQuery] int periodId, [FromQuery] int branchCode, [FromQuery] int companyCode)
        {
            var req = new LeaveApplicationSaveRequest { RequestId = requestId, RequestNo = requestNo, DocDate = DateTime.UtcNow };
            var result = _service.Save(req, 2, CurrentUserCode, periodId, branchCode, companyCode, FormClassName);
            return Ok(new { result });
        }
    }
}
