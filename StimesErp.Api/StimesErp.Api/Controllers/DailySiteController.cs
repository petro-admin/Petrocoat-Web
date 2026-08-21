using System.Security.Claims;
using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Data;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class DailySiteController : ControllerBase
    {
        private readonly DailySiteService _service;

        public DailySiteController(DailySiteService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("list")]
        public IActionResult GetList([FromQuery] int month = 0, [FromQuery] int year = 0)
        {
            var dt = _service.GetList(month, year);
            return Ok(dt.ToJsonRows());
        }

        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            var hdr = _service.GetById(id);
            if (hdr.Rows.Count == 0) return NotFound();

            return Ok(new
            {
                Header = hdr.ToJsonRows(),
                ScopeOfWork = _service.GetScopeOfWork(id).ToJsonRows(),
                Material = _service.GetMaterial(id).ToJsonRows(),
                ConsumablesOrMachineries = _service.GetConsumablesOrMachineries(id).ToJsonRows(),
                Consumables = _service.GetConsumables(id).ToJsonRows(),
                Machineries = _service.GetMachineries(id).ToJsonRows(),
                BranchHrs = _service.GetBranchHrs(id).ToJsonRows()
            });
        }

        [HttpGet("generate-docno")]
        public IActionResult GenerateDocNo([FromQuery] DateTime docDate)
        {
            var docNo = _service.GenerateDocNo(docDate);
            return Ok(new { docNo });
        }

        [HttpGet("sales-orders")]
        public IActionResult GetSalesOrders()
        {
            return Ok(_service.GetSalesOrders().ToJsonRows());
        }

        [HttpGet("sales-orders/{soCode}/details")]
        public IActionResult GetSalesOrderDetails(int soCode, [FromQuery] decimal basic = 0, [FromQuery] int dailySiteCode = 0, [FromQuery] int itemCode = 0, [FromQuery] DateTime? docDate = null)
        {
            var data = _service.GetSalesOrderDetails(soCode, basic, dailySiteCode, itemCode, docDate ?? new DateTime(1900, 1, 1));
            return Ok(data.Tables.Cast<DataTable>().Select(table => table.ToJsonRows()).ToArray());
        }

        [HttpGet("lookups")]
        public IActionResult GetLookups()
        {
            return Ok(new
            {
                scopePreparations = _service.GetScopePreparations().ToJsonRows(),
                units = _service.GetUnits().ToJsonRows(),
                materials = _service.GetMaterials().ToJsonRows(),
                employees = _service.GetEmployees().ToJsonRows(),
                consumables = _service.GetConsumables().ToJsonRows(),
                machineries = _service.GetMachineries().ToJsonRows(),
                machineryStatuses = _service.GetMachineryStatuses().ToJsonRows()
                ,customers = _service.GetCustomers().ToJsonRows()
            });
        }

        [HttpGet("sales-orders/{soCode}/revisions")]
        public IActionResult GetExistingSalesOrders(int soCode)
        {
            return Ok(_service.GetExistingSalesOrders(soCode).ToJsonRows());
        }

        [HttpGet("revision/{jobNo}")]
        public IActionResult GetRevisionNo(string jobNo)
        {
            return Ok(_service.GetRevisionNo(jobNo).ToJsonRows());
        }

        [HttpPost("save")]
        public IActionResult Save([FromBody] DailySiteSaveRequest request,
            [FromQuery] int branchCode, [FromQuery] int periodId)
        {
            // TODO: once permissions/roles are modeled server-side, re-check
            // ADD/DELETE rights here the same way CheckPermission() does in the desktop app,
            // instead of trusting the client-sent Mode.
            var result = _service.Save(request, branchCode, periodId, CurrentUserCode);
            return Ok(new { result });
        }

        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id, [FromQuery] int branchCode, [FromQuery] int periodId)
        {
            var req = new DailySiteSaveRequest { DailySiteCode = id, Mode = 2 };
            var result = _service.Save(req, branchCode, periodId, CurrentUserCode);
            return Ok(new { result });
        }
    }
}
