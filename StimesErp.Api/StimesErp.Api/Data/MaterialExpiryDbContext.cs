using Microsoft.EntityFrameworkCore;

namespace StimesErp.Api.Data
{
    // Read-only EF Core context used for the Material Expiry Report only - every other
    // report in this app queries through SqlHelper/raw ADO.NET. All entities are keyless
    // because we only ever SELECT through them here; there is no tracking or insert/update.
    public class MaterialExpiryDbContext : DbContext
    {
        public MaterialExpiryDbContext(DbContextOptions<MaterialExpiryDbContext> options) : base(options) { }

        public DbSet<PurchaseGrnDtl> PurchaseGrnDtls => Set<PurchaseGrnDtl>();
        public DbSet<PurchaseGrnHdr> PurchaseGrnHdrs => Set<PurchaseGrnHdr>();
        public DbSet<AdminItemInfoRow> AdminItemInfos => Set<AdminItemInfoRow>();
        public DbSet<AdminWareHouseInfoRow> AdminWareHouseInfos => Set<AdminWareHouseInfoRow>();
        public DbSet<PurchaseSupplierInfoRow> PurchaseSupplierInfos => Set<PurchaseSupplierInfoRow>();
        public DbSet<AdminItemCategoryRow> AdminItemCategories => Set<AdminItemCategoryRow>();
        public DbSet<AdminBranchInfoRow> AdminBranchInfos => Set<AdminBranchInfoRow>();
        public DbSet<InvoiceMaterialStockRow> InvoiceMaterialStocks => Set<InvoiceMaterialStockRow>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<PurchaseGrnDtl>(e => { e.HasNoKey(); e.ToTable("purchaseGRNDtl"); });
            modelBuilder.Entity<PurchaseGrnHdr>(e => { e.HasNoKey(); e.ToTable("purchaseGRNHdr"); });
            modelBuilder.Entity<AdminItemInfoRow>(e => { e.HasNoKey(); e.ToTable("AdminItemInfo"); });
            modelBuilder.Entity<AdminWareHouseInfoRow>(e => { e.HasNoKey(); e.ToTable("AdminWareHouseInfo"); });
            modelBuilder.Entity<PurchaseSupplierInfoRow>(e => { e.HasNoKey(); e.ToTable("purchaseSupplierInfo"); });
            modelBuilder.Entity<AdminItemCategoryRow>(e => { e.HasNoKey(); e.ToTable("AdminItemCategory"); });
            modelBuilder.Entity<AdminBranchInfoRow>(e => { e.HasNoKey(); e.ToTable("AdminBranchInfo"); });
            modelBuilder.Entity<InvoiceMaterialStockRow>(e => { e.HasNoKey(); e.ToTable("InvoiceMaterialStock"); });
        }
    }

    public class PurchaseGrnDtl
    {
        public string GRNCode { get; set; } = "";
        public string ItemCode { get; set; } = "";
        public decimal BalanceQty { get; set; }
        public decimal Rate { get; set; }
        public string? UnitDesc { get; set; }
        public string? BatchNo { get; set; }
        public string? RackNo { get; set; }
        public DateTime? ExpiryDate { get; set; }
    }

    public class PurchaseGrnHdr
    {
        public string GRNCode { get; set; } = "";
        public string? SupplierCode { get; set; }
        public string? WareHouseCode { get; set; }
        public int BranchCode { get; set; }
        public string? ActiveYesNo { get; set; }
    }

    public class AdminItemInfoRow
    {
        public string ItemCode { get; set; } = "";
        public string? ItemItemCode { get; set; }
        public string? Description { get; set; }
    }

    public class AdminWareHouseInfoRow
    {
        public string WareHouseCode { get; set; } = "";
        public string? WareHouseName { get; set; }
    }

    public class PurchaseSupplierInfoRow
    {
        public string SupplierCode { get; set; } = "";
        public string? SupplierName { get; set; }
    }

    public class AdminItemCategoryRow
    {
        public string ItemCode { get; set; } = "";
        public string? MatCategoryName { get; set; }
    }

    public class AdminBranchInfoRow
    {
        public int BranchCode { get; set; }
        public string? BranchName { get; set; }
    }

    public class InvoiceMaterialStockRow
    {
        public string ItemCode { get; set; } = "";
        public decimal StockQty { get; set; }
    }
}
