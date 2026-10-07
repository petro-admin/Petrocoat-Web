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
    [Route("[controller]")]
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

        private int CurrentUCatCode =>
            int.Parse(User.FindFirstValue("UCatCode") ?? "0");

        private int CurrentEmpCode =>
            int.Parse(User.FindFirstValue("EmpCode") ?? "0");

        // AdminUserCategoryInfo: 6 = USR (regular user) - restricted to Sales Orders/Daily Site
        // records where they're the assigned SupervisorOrForeman. ADMIN(1) and PU(3) see everything.
        private bool RestrictToSupervised => CurrentUCatCode == 6;

        [HttpGet("list")]
        public IActionResult GetList([FromQuery] int month = 0, [FromQuery] int year = 0)
        {
            var dt = _service.GetList(month, year, CurrentEmpCode, RestrictToSupervised);
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
                ConsumablesDR = _service.GetConsumablesDR(id).ToJsonRows(),
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
        public IActionResult GetSalesOrders([FromQuery] DateTime? docDate = null)
        {
            return Ok(_service.GetSalesOrders(CurrentEmpCode, RestrictToSupervised, docDate).ToJsonRows());
        }

        [HttpGet("check-existing")]
        public IActionResult CheckExisting([FromQuery] int jobCode, [FromQuery] DateTime docDate, [FromQuery] int excludeCode = 0)
        {
            return Ok(_service.CheckExistingForJobAndDate(jobCode, docDate, excludeCode));
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
                labourers = _service.GetLabourers().ToJsonRows(),
                consumables = _service.GetConsumables().ToJsonRows(),
                consumableStock = _service.GetConsumableStock().ToJsonRows(),
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

        [HttpGet("employee-hour-context")]
        public IActionResult GetEmployeeHourContext(
            [FromQuery] int employeeCode, [FromQuery] DateTime docDate, [FromQuery] int dailySiteCode,
            [FromQuery] int branchCode, [FromQuery] int periodId, [FromQuery] int jobCode = 0)
        {
            var ctx = _service.GetEmployeeHourContext(employeeCode, docDate, dailySiteCode, branchCode, periodId, jobCode);
            return Ok(ctx);
        }

        [HttpGet("attendance-employees")]
        public IActionResult GetAttendanceEmployeesForJob([FromQuery] int jobCode, [FromQuery] DateTime docDate) =>
            Ok(_service.GetAttendanceEmployeesForJob(jobCode, docDate).ToJsonRows());

        [HttpGet("scope-of-work-context")]
        public IActionResult GetScopeOfWorkContext(
            [FromQuery] int jobCode, [FromQuery] int surfacePreparationCode, [FromQuery] int dailySiteCode,
            [FromQuery] decimal scopeOfWorkAsPerJobCard, [FromQuery] int slNo, [FromQuery] string specialRequirement = "")
        {
            var ctx = _service.GetScopeOfWorkContext(jobCode, surfacePreparationCode, dailySiteCode, scopeOfWorkAsPerJobCard, slNo, specialRequirement);
            return Ok(ctx);
        }

        [HttpGet("material-previous-detail")]
        public IActionResult GetMaterialPreviousDetail([FromQuery] int jobCode, [FromQuery] int dailySiteCode, [FromQuery] int materialCode)
        {
            var ctx = _service.GetMaterialPreviousContext(jobCode, dailySiteCode, materialCode);
            return Ok(ctx);
        }

        [HttpGet("material-prev-total-used")]
        public IActionResult GetMaterialPrevTotalUsed([FromQuery] int jobCode, [FromQuery] int dailySiteCode, [FromQuery] int materialCode)
        {
            return Ok(_service.GetMaterialPrevTotalUsed(jobCode, dailySiteCode, materialCode));
        }

        [HttpGet("consumable-previous-detail")]
        public IActionResult GetConsumablePreviousDetail([FromQuery] int jobCode, [FromQuery] int dailySiteCode, [FromQuery] int consumableCode)
        {
            var ctx = _service.GetConsumablePreviousContext(jobCode, dailySiteCode, consumableCode);
            return Ok(ctx);
        }

        [HttpPost("save")]
        public IActionResult Save([FromBody] DailySiteSaveRequest request,
            [FromQuery] int branchCode, [FromQuery] int periodId)
        {
            // TODO: once permissions/roles are modeled server-side, re-check
            // ADD/DELETE rights here the same way CheckPermission() does in the desktop app,
            // instead of trusting the client-sent Mode.
            var result = _service.Save(request, branchCode, periodId, CurrentUserCode, CurrentUCatCode);
            return Ok(new { result });
        }

        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id, [FromQuery] int branchCode, [FromQuery] int periodId)
        {
            // DocDate is a non-nullable DateTime; without an explicit value it defaults to
            // 0001-01-01, which is below SQL Server's datetime minimum (1753) and throws.
            var req = new DailySiteSaveRequest { DailySiteCode = id, Mode = 2, DocDate = new DateTime(1900, 1, 1) };
            var result = _service.Save(req, branchCode, periodId, CurrentUserCode, CurrentUCatCode);
            return Ok(new { result });
        }

        // Matches desktop's PrintButton_Click / Report_DailySiteReport.rdlc - same 4 datasets,
        // rendered as a print-friendly web page instead of an RDLC report.
        [HttpGet("{id:int}/report")]
        public IActionResult GetReport(int id)
        {
            return Ok(new
            {
                Header = _service.GetHdrReport(id).ToJsonRows(),
                ScopeOfWork = _service.GetScopeOfWorkReport(id).ToJsonRows(),
                Material = _service.GetMaterialReport(id).ToJsonRows(),
                ConsumablesOrMachineries = _service.GetConsumablesOrMachineriesReport(id).ToJsonRows()
            });
        }

        // Matches desktop's PrintButton_Click1 / Report_DailySiteReportDemo.rdlc - the two pieces
        // of that preview that come from fresh queries keyed by the selected Sales Order, rather
        // than from the on-screen form grids (which the client already has).
        [HttpGet("demo-material")]
        public IActionResult GetDemoMaterial([FromQuery] int jobCode)
        {
            return Ok(_service.GetDemoMaterial(jobCode).ToJsonRows());
        }

        [HttpGet("demo-scopehrs")]
        public IActionResult GetDemoScopeHrs([FromQuery] int jobCode)
        {
            return Ok(new { scopeHrs = _service.GetDemoScopeHrs(jobCode) });
        }
    }
}
