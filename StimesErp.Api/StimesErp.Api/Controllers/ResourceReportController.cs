using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Data;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class ResourceReportController : ControllerBase
    {
        // Web-only report, no desktop equivalent to match - placed under Purchase, same module as
        // the Store Indent data it reports on.
        private const string FormClassName = "Stimes.Erp.App.Win.Purchase.Report_ResourceRequestVsIssue";

        private readonly ResourceReportService _service;

        public ResourceReportController(ResourceReportService service)
        {
            _service = service;
        }

        [HttpGet("material")]
        public IActionResult GetMaterial([FromQuery] DateTime fromDate, [FromQuery] DateTime toDate,
            [FromQuery] int soCode = 0, [FromQuery] string branchCodes = "", [FromQuery] int itemCode = 0)
        {
            return Ok(_service.GetMaterialReport(fromDate, toDate, soCode, branchCodes, itemCode).ToJsonRows());
        }

        [HttpGet("consumable")]
        public IActionResult GetConsumable([FromQuery] DateTime fromDate, [FromQuery] DateTime toDate,
            [FromQuery] int soCode = 0, [FromQuery] string branchCodes = "", [FromQuery] int itemCode = 0)
        {
            return Ok(_service.GetConsumableReport(fromDate, toDate, soCode, branchCodes, itemCode).ToJsonRows());
        }

        [HttpGet("tae")]
        public IActionResult GetTAE([FromQuery] DateTime fromDate, [FromQuery] DateTime toDate,
            [FromQuery] int soCode = 0, [FromQuery] string branchCodes = "", [FromQuery] int itemCode = 0)
        {
            return Ok(_service.GetTAEReport(fromDate, toDate, soCode, branchCodes, itemCode).ToJsonRows());
        }

        [HttpGet("lookups")]
        public IActionResult GetLookups()
        {
            return Ok(new
            {
                materials = _service.GetMaterialItems().ToJsonRows(),
                consumables = _service.GetConsumableItems().ToJsonRows(),
                taeItems = _service.GetTAEItems().ToJsonRows(),
                salesOrders = _service.GetSalesOrdersForFilter().ToJsonRows()
            });
        }
    }
}
