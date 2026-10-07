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
    public class VehicleServiceRepairController : ControllerBase
    {
        // Matches this.GetType().ToString() in the desktop app's convention - the key
        // usp_admin_GetApprovalSettingsHDR_By_FormClassName / usp_GetUserRightSecurity look up
        // configuration by. Deliberately distinct from the desktop's own Fleet_Management.VehicleRepair
        // class name, since this module is a fresh, independent schema with its own approval config.
        private const string FormClassName = "Stimes.Erp.App.Win.Fleet_Management.VehicleServiceRepair";

        private readonly VehicleServiceRepairService _service;
        private readonly ApprovalService _approval;

        public VehicleServiceRepairController(VehicleServiceRepairService service, ApprovalService approval)
        {
            _service = service;
            _approval = approval;
        }

        private int ResolveModuleCode()
        {
            var dt = _approval.GetApprovalSettingsHeader(FormClassName);
            return dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["ModuleCode"]) : 0;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

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
                Items = _service.GetItems(code).ToJsonRows(),
                Documents = _service.GetDocuments(code).ToJsonRows()
            });
        }

        [HttpGet("vehicles")]
        public IActionResult GetVehicles() => Ok(_service.GetVehicles().ToJsonRows());

        // Read-only pull from the desktop's Vehicle Inspection module, used as a starting
        // template when a vehicle is picked on a new record (see GetLatestVehicleInspectionChecklist).
        [HttpGet("inspection-checklist")]
        public IActionResult GetInspectionChecklist([FromQuery] int vehicleCode) =>
            Ok(_service.GetLatestVehicleInspectionChecklist(vehicleCode).ToJsonRows());

        [HttpGet("drivers")]
        public IActionResult GetDrivers() => Ok(_service.GetDrivers().ToJsonRows());

        [HttpGet("generate-docno")]
        public IActionResult GenerateDocNo() => Ok(new { docNo = _service.GenerateDocNo() });

        // Saves to the same shared network path convention desktop uses (see
        // VehicleServiceRepairService.GetServerPath) instead of a folder next to the API's own
        // deployed files - a redeploy can never wipe these. The full UNC path is what gets stored
        // back into the DocUpload column, same as desktop does for its own document uploads.
        [HttpPost("upload")]
        [RequestSizeLimit(20_000_000)]
        public async Task<IActionResult> UploadDocument(IFormFile file, [FromQuery] int branchCode)
        {
            if (file == null || file.Length == 0) return BadRequest(new { message = "No file received." });
            if (file.Length > 20_000_000) return BadRequest(new { message = "File too large (max 20 MB)." });

            var serverPath = _service.GetServerPath(branchCode);
            if (string.IsNullOrWhiteSpace(serverPath))
                return StatusCode(500, new { message = "No server storage path configured for this branch." });

            var folder = Path.Combine(serverPath.TrimEnd('\\', '/'), "VehicleServiceRepair");
            Directory.CreateDirectory(folder);

            // Sanitize the original filename (same invalid chars desktop strips) and prefix with a
            // short GUID to avoid collisions, while keeping the name recognizable in the shared folder.
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
            // Only ever a UNC path we ourselves wrote via UploadDocument above - this rejects a
            // local absolute path (e.g. C:\Windows\...) so the endpoint can't be used to browse
            // the API server's own filesystem.
            if (string.IsNullOrWhiteSpace(path) || !path.StartsWith(@"\\")) return BadRequest();
            if (!System.IO.File.Exists(path)) return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(path, out var contentType))
                contentType = "application/octet-stream";

            var stream = System.IO.File.OpenRead(path);
            return File(stream, contentType, Path.GetFileName(path));
        }

        [HttpPost("save")]
        public IActionResult Save([FromBody] VehicleServiceRepairSaveRequest request, [FromQuery] int periodId)
        {
            var mode = request.Code > 0 ? 1 : 0;
            var (result, code) = _service.Save(request, periodId, CurrentUserCode, mode, ResolveModuleCode());
            return Ok(new { result, code });
        }

        [HttpDelete("{code:int}")]
        public IActionResult Delete(int code, [FromQuery] int periodId)
        {
            var req = new VehicleServiceRepairSaveRequest { Code = code, DocDate = DateTime.UtcNow, ServiceType = "REPAIR" };
            var (result, _) = _service.Save(req, periodId, CurrentUserCode, 2, ResolveModuleCode());
            return Ok(new { result });
        }
    }
}
