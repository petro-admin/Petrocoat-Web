using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class MaterialExpiryReportController : ControllerBase
    {
        private readonly MaterialExpiryReportService _service;

        public MaterialExpiryReportController(MaterialExpiryReportService service)
        {
            _service = service;
        }

        [HttpGet("list")]
        public async Task<IActionResult> GetList(
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] int branchCode = 0,
            [FromQuery] string warehouse = "",
            [FromQuery] string itemCode = "",
            [FromQuery] string matCategory = "",
            [FromQuery] string supplier = "",
            [FromQuery] string expiryStatus = "")
        {
            var rows = await _service.GetListAsync(fromDate, toDate, branchCode, warehouse, itemCode, matCategory, supplier);

            // The "All / Already Expired / Expiring Today / Expiring in 7 Days / Expiring in 30
            // Days / Expiring Later" bucket is a plain derived range over DaysToExpire - simpler
            // to apply as a filter here than inside the LINQ query, and row counts for this
            // report are small enough that it costs nothing.
            if (!string.IsNullOrEmpty(expiryStatus) && expiryStatus != "all")
            {
                rows = rows.Where(r => expiryStatus switch
                {
                    "expired" => r.DaysToExpire < 0,
                    "today" => r.DaysToExpire == 0,
                    "7days" => r.DaysToExpire >= 0 && r.DaysToExpire <= 7,
                    "30days" => r.DaysToExpire >= 0 && r.DaysToExpire <= 30,
                    "later" => r.DaysToExpire > 30,
                    _ => true
                }).ToList();
            }

            return Ok(rows);
        }

        [HttpGet("warehouses")]
        public async Task<IActionResult> GetWarehouses() => Ok(await _service.GetWarehousesAsync());

        [HttpGet("material-categories")]
        public async Task<IActionResult> GetMaterialCategories() => Ok(await _service.GetMaterialCategoriesAsync());

        [HttpGet("materials")]
        public async Task<IActionResult> GetMaterials() => Ok(await _service.GetMaterialsAsync());

        [HttpGet("suppliers")]
        public async Task<IActionResult> GetSuppliers() => Ok(await _service.GetSuppliersAsync());
    }
}
