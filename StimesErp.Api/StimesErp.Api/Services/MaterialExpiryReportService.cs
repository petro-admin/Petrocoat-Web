using System.Data;
using Microsoft.EntityFrameworkCore;
using StimesErp.Api.Data;

namespace StimesErp.Api.Services
{
    // New report (no desktop equivalent) - confirmed by direct schema inspection that
    // purchaseGRNDtl already carries BatchNo/ExpiryDate/RackNo per GRN line, and purchaseGRNHdr
    // links to Supplier/WareHouse/Branch - the per-batch rows come from the same GRN tables
    // desktop's Stock Register report (uspinventStockDetailsReportByTypeNew) draws its own
    // ExpiryDate from, just queried directly here instead of through that report's bigger
    // multi-UNION stock-ledger procedure. The Stock Qty column, though, is deliberately NOT
    // batch-level - it's each item's current Total Stock, computed the same way desktop computes
    // it (SUM(InvoiceMaterialStock.StockQty) per item), so every batch row of the same item shows
    // that item's real current stock, matching desktop's own Stock Report number exactly.
    // d.BalanceQty > 0 (filtered below) still scopes which BATCHES show up to ones with stock
    // left - a fully consumed batch has nothing left to expire into a problem - it just isn't
    // what's displayed in the Qty column itself. Uses EF Core (LINQ) rather than SqlHelper,
    // unlike every other report in this app - a deliberate exception for this one report.
    public class MaterialExpiryReportService
    {
        private readonly MaterialExpiryDbContext _ctx;
        private readonly SqlHelper _db;

        public MaterialExpiryReportService(MaterialExpiryDbContext ctx, SqlHelper db)
        {
            _ctx = ctx;
            _db = db;
        }

        public async Task<List<MaterialExpiryRow>> GetListAsync(
            DateTime? fromDate, DateTime? toDate, int branchCode,
            string? warehouse, string? itemCode, string? matCategory, string? supplier)
        {
            // Matches desktop's "Total Stock" exactly (Report_StockRegisterNew's
            // uspinventStockDetailsReportByTypeNew: TotalStock = SUM(StockQty) per item across
            // the whole InvoiceMaterialStock ledger - OPENING/GRN/RETURN add, ISSUE/DNote/DISCARD
            // subtract, already sign-adjusted in StockQty itself). purchaseGRNDtl.BalanceQty is a
            // different, narrower number (what's left on one specific GRN line) - using it here
            // was why this report's Qty column didn't match desktop's Stock Report at all.
            //
            // This is computed via raw SQL (SqlHelper), not EF, and merged into the EF-queried
            // rows afterward in C#: InvoiceMaterialStock.ItemCode is a real SQL `int`, while
            // PurchaseGrnDtl.ItemCode is `numeric` and AdminItemInfo.ItemCode is `int` too but
            // mapped as `string` throughout this DbContext (fine for SQL-side join/filter
            // translation, which never materializes the value) - grouping and projecting
            // InvoiceMaterialStock.ItemCode directly through EF requires materializing it into a
            // CLR value, which throws InvalidCastException against a string-typed property. Doing
            // the aggregation in raw SQL sidesteps the mismatch entirely.
            var stockTotalsTable = _db.GetDataTableFromQuery(
                @"select AII.ItemItemCode as ItemCode, SUM(IMS.StockQty) as TotalStock
                  from InvoiceMaterialStock IMS
                  inner join AdminItemInfo AII on AII.ItemCode = IMS.ItemCode
                  group by AII.ItemItemCode");
            var stockTotals = stockTotalsTable.AsEnumerable()
                .Where(r => r["ItemCode"] != DBNull.Value)
                .ToDictionary(r => r["ItemCode"].ToString()!, r => r["TotalStock"] == DBNull.Value ? 0 : Convert.ToDecimal(r["TotalStock"]));

            var query =
                from d in _ctx.PurchaseGrnDtls
                join h in _ctx.PurchaseGrnHdrs on d.GRNCode equals h.GRNCode
                join i in _ctx.AdminItemInfos on d.ItemCode equals i.ItemCode
                join wh0 in _ctx.AdminWareHouseInfos on h.WareHouseCode equals wh0.WareHouseCode into whJoin
                from wh in whJoin.DefaultIfEmpty()
                join sup0 in _ctx.PurchaseSupplierInfos on h.SupplierCode equals sup0.SupplierCode into supJoin
                from sup in supJoin.DefaultIfEmpty()
                join cat0 in _ctx.AdminItemCategories on d.ItemCode equals cat0.ItemCode into catJoin
                from cat in catJoin.DefaultIfEmpty()
                join b0 in _ctx.AdminBranchInfos on h.BranchCode equals b0.BranchCode into branchJoin
                from b in branchJoin.DefaultIfEmpty()
                where h.ActiveYesNo == "Y"
                      && d.ExpiryDate != null
                      // Legacy data carries 01-Jan-1900 in ExpiryDate to mean "no real expiry
                      // was ever recorded", not an actual date - comparing by Year (translated
                      // to DATEPART) rather than a literal DateTime avoids EF inlining a
                      // datetime2-formatted literal that this datetime(3) column can't convert.
                      && d.ExpiryDate.Value.Year > 1900
                      && d.BalanceQty > 0
                      && (branchCode == 0 || h.BranchCode == branchCode)
                      && (string.IsNullOrEmpty(warehouse) || wh!.WareHouseName == warehouse)
                      && (string.IsNullOrEmpty(itemCode) || i.ItemItemCode == itemCode)
                      && (string.IsNullOrEmpty(matCategory) || cat!.MatCategoryName == matCategory)
                      && (string.IsNullOrEmpty(supplier) || (sup != null && sup.SupplierName == supplier))
                      && (fromDate == null || d.ExpiryDate >= fromDate)
                      && (toDate == null || d.ExpiryDate <= toDate)
                orderby d.ExpiryDate
                select new MaterialExpiryRow
                {
                    MaterialCode = i.ItemItemCode ?? "",
                    MaterialName = i.Description ?? "",
                    BatchNo = d.BatchNo,
                    WareHouseName = wh != null ? wh.WareHouseName : null,
                    Unit = d.UnitDesc,
                    ExpiryDate = d.ExpiryDate!.Value,
                    SupplierName = sup != null ? sup.SupplierName : null,
                    MatCategoryName = cat != null ? cat.MatCategoryName : null,
                    BranchName = b != null ? b.BranchName : null
                };

            var rows = await query.ToListAsync();

            var today = DateTime.Today;
            foreach (var row in rows)
            {
                row.Qty = stockTotals.TryGetValue(row.MaterialCode, out var total) ? total : 0;
                row.DaysToExpire = (row.ExpiryDate.Date - today).Days;
                row.Status = row.DaysToExpire < 0 ? "Expired"
                    : row.DaysToExpire == 0 ? "Expiring Today"
                    : row.DaysToExpire <= 7 ? "Expiring Soon"
                    : row.DaysToExpire <= 30 ? "Expiring in 30 Days"
                    : "OK";
            }

            return rows;
        }

        public Task<List<string>> GetWarehousesAsync() =>
            _ctx.AdminWareHouseInfos
                .Where(w => !string.IsNullOrEmpty(w.WareHouseName))
                .Select(w => w.WareHouseName!)
                .Distinct()
                .OrderBy(x => x)
                .ToListAsync();

        // Matches desktop's own Report_StockRegisterNew.xaml.cs FillMaterialcategory() exactly -
        // scoped to categories with actual stock movement (joined through InvoiceMaterialStock),
        // not every category that merely exists in the master table. Without this join, the
        // dropdown showed "ghost" categories with no stock behind them at all.
        public Task<List<string>> GetMaterialCategoriesAsync() =>
            (from c in _ctx.AdminItemCategories
             where !string.IsNullOrEmpty(c.MatCategoryName)
             where _ctx.InvoiceMaterialStocks.Any(s => s.ItemCode == c.ItemCode)
             select c.MatCategoryName!)
            .Distinct()
            .OrderBy(x => x)
            .ToListAsync();

        public Task<List<MaterialOption>> GetMaterialsAsync() =>
            _ctx.AdminItemInfos
                .Where(i => !string.IsNullOrEmpty(i.ItemItemCode))
                .Select(i => new MaterialOption { ItemCode = i.ItemItemCode!, Description = i.Description ?? "" })
                .Distinct()
                .OrderBy(x => x.ItemCode)
                .ToListAsync();

        public Task<List<string>> GetSuppliersAsync() =>
            _ctx.PurchaseSupplierInfos
                .Where(s => !string.IsNullOrEmpty(s.SupplierName))
                .Select(s => s.SupplierName!)
                .Distinct()
                .OrderBy(x => x)
                .ToListAsync();
    }

    public class MaterialOption
    {
        public string ItemCode { get; set; } = "";
        public string Description { get; set; } = "";
    }

    public class MaterialExpiryRow
    {
        public string MaterialCode { get; set; } = "";
        public string MaterialName { get; set; } = "";
        public string? BatchNo { get; set; }
        public string? WareHouseName { get; set; }
        public decimal Qty { get; set; }
        public string? Unit { get; set; }
        public DateTime ExpiryDate { get; set; }
        public int DaysToExpire { get; set; }
        public string? SupplierName { get; set; }
        public string? MatCategoryName { get; set; }
        public string? BranchName { get; set; }
        public string Status { get; set; } = "";
    }
}
