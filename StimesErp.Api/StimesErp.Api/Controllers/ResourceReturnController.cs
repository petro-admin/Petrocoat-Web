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
    public class ResourceReturnController : ControllerBase
    {
        // Matches this.GetType().ToString() in the desktop app's convention EXACTLY - same string
        // desktop's ResourceRetrurn (sic) form uses (AdminModuleInfo ModuleCode 331, already
        // registered), so permissions/approval config are shared between the two apps.
        private const string FormClassName = "Stimes.Erp.App.Win.Production.ResourceRetrurn";

        private readonly ResourceReturnService _service;

        public ResourceReturnController(ResourceReturnService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("generate-docno")]
        public IActionResult GenerateDocNo() => Ok(new { matReturnNo = _service.GetNextDocNo() });

        [HttpGet("issues")]
        public IActionResult GetIssueList([FromQuery] int branchCode, [FromQuery] int periodId, [FromQuery] int companyCode) =>
            Ok(_service.GetIssueList(branchCode, periodId, companyCode).ToJsonRows());

        [HttpGet("issues/{matIssueCode:int}")]
        public IActionResult GetIssueInfo(int matIssueCode) =>
            Ok(_service.GetIssueInfo(matIssueCode).ToJsonRows().FirstOrDefault());

        [HttpGet("issues/{matIssueCode:int}/materials")]
        public IActionResult GetMaterialsForIssue(int matIssueCode) => Ok(_service.GetMaterialsForIssue(matIssueCode).ToJsonRows());

        [HttpGet("issues/{matIssueCode:int}/consumables")]
        public IActionResult GetConsumablesForIssue(int matIssueCode) => Ok(_service.GetConsumablesForIssue(matIssueCode).ToJsonRows());

        [HttpGet("issues/{matIssueCode:int}/tools-equipment")]
        public IActionResult GetTaeForIssue(int matIssueCode) => Ok(_service.GetTaeForIssue(matIssueCode).ToJsonRows());

        [HttpGet("issues/{matIssueCode:int}/general-services")]
        public IActionResult GetGeneralForIssue(int matIssueCode) => Ok(_service.GetGeneralForIssue(matIssueCode).ToJsonRows());

        [HttpGet("issues/{matIssueCode:int}/subcontract")]
        public IActionResult GetSubContractForIssue(int matIssueCode) => Ok(_service.GetSubContractForIssue(matIssueCode).ToJsonRows());

        [HttpGet("issues/{matIssueCode:int}/tools-equipment-hire")]
        public IActionResult GetTaeHireForIssue(int matIssueCode) => Ok(_service.GetTaeHireForIssue(matIssueCode).ToJsonRows());

        [HttpGet("lookups")]
        public IActionResult GetLookups([FromQuery] int branchCode, [FromQuery] int companyCode) => Ok(new
        {
            warehouses = _service.GetWarehouses(branchCode, companyCode).ToJsonRows(),
            employees = _service.GetEmployees().ToJsonRows(),
            costCenters = _service.GetCostCenters(branchCode).ToJsonRows(),
            conditionsOfMachine = _service.GetConditionOfMachine().ToJsonRows(),
            units = _service.GetUnits().ToJsonRows(),
            items = _service.GetItems().ToJsonRows(),
            consumables = _service.GetConsumables().ToJsonRows(),
            toolsAndEquipment = _service.GetToolsAndEquipment().ToJsonRows()
        });

        [HttpGet("list")]
        public IActionResult GetList([FromQuery] int periodId, [FromQuery] int branchCode, [FromQuery] int companyCode) =>
            Ok(_service.GetList(periodId, branchCode, companyCode).ToJsonRows());

        [HttpGet("{matReturnCode:int}")]
        public IActionResult GetById(int matReturnCode)
        {
            var hdr = _service.GetHeaderById(matReturnCode);
            if (hdr.Rows.Count == 0) return NotFound();

            return Ok(new
            {
                Header = hdr.ToJsonRows()[0],
                Materials = _service.GetMaterialsById(matReturnCode).ToJsonRows(),
                Consumables = _service.GetConsumablesById(matReturnCode).ToJsonRows(),
                ToolsAndEquipment = _service.GetTaeById(matReturnCode).ToJsonRows(),
                GeneralServices = _service.GetGeneralById(matReturnCode).ToJsonRows(),
                SubContract = _service.GetSubContractById(matReturnCode).ToJsonRows(),
                ToolsAndEquipmentHire = _service.GetTaeHireById(matReturnCode).ToJsonRows()
            });
        }

        [HttpPost("upload")]
        [RequestSizeLimit(20_000_000)]
        public async Task<IActionResult> UploadDocument(IFormFile file, [FromQuery] int branchCode)
        {
            if (file == null || file.Length == 0) return BadRequest(new { message = "No file received." });
            if (file.Length > 20_000_000) return BadRequest(new { message = "File too large (max 20 MB)." });

            var serverPath = _service.GetServerPath(branchCode);
            if (string.IsNullOrWhiteSpace(serverPath))
                return StatusCode(500, new { message = "No server storage path configured for this branch." });

            var folder = Path.Combine(serverPath.TrimEnd('\\', '/'), "ResourceReturn");
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
        public IActionResult Save([FromBody] ResourceReturnSaveRequest request, [FromQuery] int branchCode, [FromQuery] int companyCode, [FromQuery] int periodId)
        {
            var (result, code) = _service.Save(request, CurrentUserCode, branchCode, companyCode, periodId);
            return Ok(new { result, code });
        }

        [HttpDelete("{matReturnCode:int}")]
        public IActionResult Delete(int matReturnCode, [FromQuery] int branchCode, [FromQuery] int companyCode)
        {
            _service.Delete(matReturnCode, branchCode, companyCode);
            return Ok(new { result = "Deleted Successfully" });
        }
    }
}
