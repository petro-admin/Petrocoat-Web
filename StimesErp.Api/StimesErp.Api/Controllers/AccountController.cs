using System.Linq;
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
    public class AccountController : ControllerBase
    {
        private readonly AccountService _service;

        public AccountController(AccountService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("currency")]
        public IActionResult GetCurrencyForBranch([FromQuery] int branchCode)
        {
            var dt = _service.GetCurrencyForBranch(branchCode);
            if (dt.Rows.Count == 0) return NotFound();
            return Ok(dt.ToJsonRows()[0]);
        }

        [HttpGet("groups")]
        public IActionResult GetGroups() => Ok(_service.GetGroups().ToJsonRows());

        [HttpGet("heads")]
        public IActionResult GetHeads([FromQuery] int branchCode) => Ok(_service.GetHeads(branchCode).ToJsonRows());

        [HttpGet("suppliers")]
        public IActionResult GetSuppliers([FromQuery] int branchCode) => Ok(_service.GetSuppliers(branchCode).ToJsonRows());

        [HttpGet("customers")]
        public IActionResult GetCustomers([FromQuery] int branchCode) => Ok(_service.GetCustomers(branchCode).ToJsonRows());

        [HttpGet("heads/{code:int}")]
        public IActionResult GetHeadById(int code)
        {
            var dt = _service.GetHeadById(code);
            if (dt.Rows.Count == 0) return NotFound();
            return Ok(dt.ToJsonRows()[0]);
        }

        [HttpGet("heads/{code:int}/balance")]
        public IActionResult GetHeadBalance(int code)
        {
            var balance = _service.GetAccountBalance(code);
            return Ok(new { balance, drCr = balance >= 0 ? "Dr" : "Cr" });
        }

        [HttpPost("heads/save")]
        public IActionResult SaveHead([FromBody] AccountHeadSaveRequest request)
        {
            var (result, code) = _service.SaveHead(request, CurrentUserCode);
            return Ok(new { result, code });
        }

        [HttpDelete("heads/{code:int}")]
        public IActionResult DeleteHead(int code)
        {
            _service.DeleteHead(code);
            return Ok(new { result = "Deleted Successfully" });
        }

        // ---------- Vouchers ----------

        [HttpGet("vouchers/generate-no")]
        public IActionResult GenerateVoucherNo([FromQuery] string voucherType) =>
            Ok(new { voucherNo = _service.GenerateVoucherNo(voucherType) });

        [HttpGet("vouchers")]
        public IActionResult GetVoucherList([FromQuery] int branchCode) => Ok(_service.GetVoucherList(branchCode).ToJsonRows());

        [HttpGet("vouchers/{code:int}")]
        public IActionResult GetVoucherById(int code)
        {
            var hdr = _service.GetVoucherHeader(code);
            if (hdr.Rows.Count == 0) return NotFound();
            return Ok(new
            {
                Header = hdr.ToJsonRows()[0],
                Lines = _service.GetVoucherLines(code).ToJsonRows(),
                Allocations = _service.GetVoucherAllocations(code).ToJsonRows(),
                Documents = _service.GetVoucherDocuments(code).ToJsonRows()
            });
        }

        [HttpPost("vouchers/save")]
        public IActionResult SaveVoucher([FromBody] VoucherSaveRequest request)
        {
            var (result, code) = _service.SaveVoucher(request, CurrentUserCode);
            return Ok(new { result, code });
        }

        // Same shared UNC storage convention AccidentReport/VehicleServiceRepair's own upload uses -
        // a redeploy of the API can never wipe an attached document.
        [HttpPost("upload")]
        [RequestSizeLimit(20_000_000)]
        public async Task<IActionResult> UploadDocument(IFormFile file, [FromQuery] int branchCode)
        {
            if (file == null || file.Length == 0) return BadRequest(new { message = "No file received." });
            if (file.Length > 20_000_000) return BadRequest(new { message = "File too large (max 20 MB)." });

            var serverPath = _service.GetServerPath(branchCode);
            if (string.IsNullOrWhiteSpace(serverPath))
                return StatusCode(500, new { message = "No server storage path configured for this branch." });

            var folder = Path.Combine(serverPath.TrimEnd('\\', '/'), "AccountVouchers");
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

        [HttpGet("document")]
        public IActionResult DownloadDocument([FromQuery] string path)
        {
            // Only ever a UNC path we ourselves wrote via UploadDocument above.
            if (string.IsNullOrWhiteSpace(path) || !path.StartsWith(@"\\")) return BadRequest();
            if (!System.IO.File.Exists(path)) return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(path, out var contentType))
                contentType = "application/octet-stream";

            var stream = System.IO.File.OpenRead(path);
            return File(stream, contentType);
        }

        [HttpDelete("vouchers/{code:int}")]
        public IActionResult DeleteVoucher(int code)
        {
            _service.DeleteVoucher(code);
            return Ok(new { result = "Deleted Successfully" });
        }

        // ---------- Sales Invoices ----------

        [HttpGet("sales-invoices/generate-no")]
        public IActionResult GenerateSalesInvoiceNo() => Ok(new { invoiceNo = _service.GenerateInvoiceNo("Sales") });

        [HttpGet("sales-invoices")]
        public IActionResult GetSalesInvoiceList([FromQuery] int branchCode) => Ok(_service.GetSalesInvoiceList(branchCode).ToJsonRows());

        [HttpGet("sales-invoices/open")]
        public IActionResult GetOpenSalesInvoices([FromQuery] int customerCode, [FromQuery] int branchCode) =>
            Ok(_service.GetOpenSalesInvoices(customerCode, branchCode).ToJsonRows());

        [HttpGet("sales-invoices/{code:int}")]
        public IActionResult GetSalesInvoiceById(int code)
        {
            var hdr = _service.GetSalesInvoiceHeader(code);
            if (hdr.Rows.Count == 0) return NotFound();
            return Ok(new { Header = hdr.ToJsonRows()[0], Lines = _service.GetSalesInvoiceLines(code).ToJsonRows() });
        }

        [HttpPost("sales-invoices/save")]
        public IActionResult SaveSalesInvoice([FromBody] SalesInvoiceSaveRequest request)
        {
            var (result, code) = _service.SaveSalesInvoice(request, CurrentUserCode);
            return Ok(new { result, code });
        }

        [HttpDelete("sales-invoices/{code:int}")]
        public IActionResult DeleteSalesInvoice(int code)
        {
            _service.DeleteSalesInvoice(code);
            return Ok(new { result = "Deleted Successfully" });
        }

        // ---------- Purchase Invoices ----------

        [HttpGet("purchase-invoices/generate-no")]
        public IActionResult GeneratePurchaseInvoiceNo() => Ok(new { invoiceNo = _service.GenerateInvoiceNo("Purchase") });

        [HttpGet("purchase-invoices")]
        public IActionResult GetPurchaseInvoiceList([FromQuery] int branchCode) => Ok(_service.GetPurchaseInvoiceList(branchCode).ToJsonRows());

        [HttpGet("purchase-invoices/open")]
        public IActionResult GetOpenPurchaseInvoices([FromQuery] int supplierCode, [FromQuery] int branchCode, [FromQuery] int excludeVoucherCode = 0) =>
            Ok(_service.GetOpenPurchaseInvoices(supplierCode, branchCode, excludeVoucherCode).ToJsonRows());

        [HttpGet("purchase-invoices/{code:int}")]
        public IActionResult GetPurchaseInvoiceById(int code)
        {
            var hdr = _service.GetPurchaseInvoiceHeader(code);
            if (hdr.Rows.Count == 0) return NotFound();
            return Ok(new { Header = hdr.ToJsonRows()[0], Lines = _service.GetPurchaseInvoiceLines(code).ToJsonRows() });
        }

        [HttpPost("purchase-invoices/save")]
        public IActionResult SavePurchaseInvoice([FromBody] PurchaseInvoiceSaveRequest request)
        {
            var (result, code) = _service.SavePurchaseInvoice(request, CurrentUserCode);
            return Ok(new { result, code });
        }

        [HttpDelete("purchase-invoices/{code:int}")]
        public IActionResult DeletePurchaseInvoice(int code)
        {
            _service.DeletePurchaseInvoice(code);
            return Ok(new { result = "Deleted Successfully" });
        }

        [HttpGet("sales-orders")]
        public IActionResult GetSalesOrders() => Ok(_service.GetSalesOrders().ToJsonRows());

        // ---------- Cost Centers ----------

        [HttpGet("cost-centers")]
        public IActionResult GetCostCenters([FromQuery] int branchCode) => Ok(_service.GetCostCenters(branchCode).ToJsonRows());

        [HttpGet("cost-centers/{code:int}")]
        public IActionResult GetCostCenterById(int code)
        {
            var dt = _service.GetCostCenterById(code);
            if (dt.Rows.Count == 0) return NotFound();
            return Ok(dt.ToJsonRows()[0]);
        }

        [HttpPost("cost-centers/save")]
        public IActionResult SaveCostCenter([FromBody] CostCenterSaveRequest request)
        {
            var (result, code) = _service.SaveCostCenter(request, CurrentUserCode);
            return Ok(new { result, code });
        }

        [HttpDelete("cost-centers/{code:int}")]
        public IActionResult DeleteCostCenter(int code)
        {
            _service.DeleteCostCenter(code);
            return Ok(new { result = "Deleted Successfully" });
        }

        // ---------- Reports ----------

        [HttpPost("reports/ledger")]
        public IActionResult GetLedger([FromBody] LedgerReportRequest request)
        {
            if (request?.AccountHeadCodes == null || request.AccountHeadCodes.Count == 0) return Ok(new List<object>());

            var results = _service.GetLedgerMulti(request.AccountHeadCodes, request.FromDate, request.ToDate);
            return Ok(results.Select(r => new
            {
                accountHeadCode = r.AccountHeadCode,
                headName = r.HeadName,
                openingBalance = r.OpeningBalance,
                lines = r.Lines.ToJsonRows()
            }));
        }

        [HttpGet("reports/trial-balance")]
        public IActionResult GetTrialBalance([FromQuery] int branchCode, [FromQuery] DateTime asOfDate) =>
            Ok(_service.GetTrialBalance(branchCode, asOfDate).ToJsonRows());

        [HttpGet("reports/balance-sheet")]
        public IActionResult GetBalanceSheet([FromQuery] int branchCode, [FromQuery] DateTime asOfDate) =>
            Ok(_service.GetBalanceSheet(branchCode, asOfDate).ToJsonRows());

        [HttpGet("reports/profit-and-loss")]
        public IActionResult GetProfitAndLoss([FromQuery] int branchCode, [FromQuery] DateTime fromDate, [FromQuery] DateTime toDate) =>
            Ok(_service.GetProfitAndLoss(branchCode, fromDate, toDate).ToJsonRows());
    }
}
