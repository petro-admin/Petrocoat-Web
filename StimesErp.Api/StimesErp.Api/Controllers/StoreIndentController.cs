using System.Security.Claims;
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
    public class StoreIndentController : ControllerBase
    {
        // Matches this.GetType().ToString() in the desktop app's StoreIndent.xaml.cs - the key
        // usp_admin_GetApprovalSettingsHDR_By_FormClassName looks up approval configuration by.
        private const string FormClassName = "Stimes.Erp.App.Win.Purchase.StoreIndent";

        private readonly StoreIndentService _service;
        private readonly ApprovalService _approval;

        public StoreIndentController(StoreIndentService service, ApprovalService approval)
        {
            _service = service;
            _approval = approval;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        private int ResolveModuleCode()
        {
            var dt = _approval.GetApprovalSettingsHeader(FormClassName);
            return dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["ModuleCode"]) : 0;
        }

        [HttpGet("list")]
        public IActionResult GetList([FromQuery] int branchCode, [FromQuery] int month, [FromQuery] int periodId, [FromQuery] int year)
        {
            int yearCode = year > 99 ? year % 100 : year;
            return Ok(_service.GetList(branchCode, month, periodId, yearCode).ToJsonRows());
        }

        [HttpGet("{id:int}")]
        public IActionResult GetById(int id, [FromQuery] int branchCode)
        {
            var hdr = _service.GetHeader(id, branchCode);
            if (hdr.Rows.Count == 0) return NotFound();

            return Ok(new
            {
                Header = hdr.ToJsonRows(),
                General = TryFetch(() => _service.GetGeneral(id)),
                Material = TryFetch(() => _service.GetMaterial(id)),
                Consumable = TryFetch(() => _service.GetConsumable(id)),
                TAE = TryFetch(() => _service.GetTAE(id))
            });
        }

        // Matches desktop's GetPRequisitionDetails, which wraps the whole detail-loading block in
        // an empty catch: a broken detail SP (e.g. usp_Purchase_GetStoreIndentDtlsMaterial's
        // "Invalid column name 'ItemCode'") shouldn't stop the header/other grids from loading -
        // it should just leave that one grid empty, same as it silently does on desktop.
        private static List<Dictionary<string, object?>> TryFetch(Func<System.Data.DataTable> fetch)
        {
            try { return fetch().ToJsonRows(); }
            catch { return new List<Dictionary<string, object?>>(); }
        }

        [HttpGet("generate-docno")]
        public IActionResult GenerateDocNo([FromQuery] int periodId)
        {
            return Ok(new { docNo = _service.GenerateRequisitionNo(periodId) });
        }

        [HttpGet("lookups")]
        public IActionResult GetLookups([FromQuery] int branchCode)
        {
            return Ok(new
            {
                costCenters = _service.GetCostCenters(branchCode).ToJsonRows(),
                units = _service.GetUnits().ToJsonRows(),
                salesOrders = _service.GetSalesOrders(branchCode).ToJsonRows(),
                users = _service.GetUsersOfBranch(branchCode).ToJsonRows(),
                employees = _service.GetEmployees().ToJsonRows(),
                requestedStatuses = _service.GetResourceRequestedStatuses().ToJsonRows()
            });
        }

        [HttpGet("employee-designation")]
        public IActionResult GetEmployeeDesignation([FromQuery] int employeeCode)
        {
            return Ok(new { designation = _service.GetEmployeeDesignation(employeeCode) });
        }

        // General grid: Type-driven item list (Material/Consumable/Tools & Equipment).
        [HttpGet("item-lookup")]
        public IActionResult GetItemLookup([FromQuery] int typeCode)
        {
            return Ok(_service.GetGeneralItemLookup(typeCode).ToJsonRows());
        }

        // General grid: Status = Exist -> resolve UnitCode/StockQty for the picked item.
        [HttpGet("item-spec")]
        public IActionResult GetItemSpec([FromQuery] int itemCode, [FromQuery] int typeCode, [FromQuery] int periodId)
        {
            var dt = _service.GetItemSpecificationForPurchase(itemCode, typeCode, periodId);
            return Ok(dt.Rows.Count > 0 ? dt.ToJsonRows()[0] : null);
        }

        // Project mode: Sales-Order-linked Material/Consumable/Tools & Equipment pull,
        // refreshed whenever the Sales Order selection changes (or SOCode=0 for a fresh form).
        [HttpGet("sales-order/{soCode:int}/estimation")]
        public IActionResult GetSalesOrderEstimation(int soCode, [FromQuery] int periodId)
        {
            return Ok(new
            {
                Material = _service.GetSalesOrderMaterial(soCode, periodId).ToJsonRows(),
                Consumable = _service.GetEstimationConsumable(soCode, periodId).ToJsonRows(),
                TAE = _service.GetEstimationTAE(soCode, periodId, 2).ToJsonRows()
            });
        }

        [HttpGet("approval-settings")]
        public IActionResult GetApprovalSettings()
        {
            var dt = _approval.GetApprovalSettingsHeader(FormClassName);
            return Ok(new
            {
                isApproval = dt.Rows.Count > 0,
                moduleCode = dt.Rows.Count > 0 ? Convert.ToInt32(dt.Rows[0]["ModuleCode"]) : 0,
                formClassName = FormClassName
            });
        }

        [HttpPost("save")]
        public IActionResult Save([FromBody] StoreIndentSaveRequest request,
            [FromQuery] int companyCode, [FromQuery] int branchCode, [FromQuery] int periodId)
        {
            var result = _service.Save(request, companyCode, branchCode, periodId, CurrentUserCode, ResolveModuleCode());
            return Ok(new { result });
        }

        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            var result = _service.Delete(id, ResolveModuleCode(), CurrentUserCode);
            return Ok(new { result });
        }
    }
}
