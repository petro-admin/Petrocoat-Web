using System.Data;
using Microsoft.Data.SqlClient;
using StimesErp.Api.Data;
using StimesErp.Api.Models;

namespace StimesErp.Api.Services
{
    /// <summary>
    /// Web equivalent of Stimes.Erp.Library.ClsDailySite - calls the exact same stored procedures.
    /// </summary>
    public class DailySiteService
    {
        private readonly SqlHelper _db;

        public DailySiteService(SqlHelper db)
        {
            _db = db;
        }

        // Grid list: WPF calls GetDailySiteHdr(0, Month, Year)
        public DataTable GetList(int month, int year)
        {
            int yearCode = year > 99 ? year % 100 : year; // SP expects 2-digit year, e.g. 2026 -> 26

            var p = new[]
            {
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, 0),
                SqlHelper.Param("@MonthCode", SqlDbType.Int, month),
                SqlHelper.Param("@YearCode", SqlDbType.Int, yearCode)
            };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteHdr", p);
        }

        // Detail header: WPF calls GetDailySiteHdr(DailySiteCode, 0, 0)
        public DataTable GetById(int dailySiteCode)
        {
            var p = new[]
            {
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode),
                SqlHelper.Param("@MonthCode", SqlDbType.Int, 0),
                SqlHelper.Param("@YearCode", SqlDbType.Int, 0)
            };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteHdr", p);
        }

        public DataTable GetScopeOfWork(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteScopeOfWork", p);
        }

        public DataTable GetMaterial(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteMaterial", p);
        }

        public DataTable GetConsumablesOrMachineries(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteConsumablesOrMachineries", p);
        }

        public DataTable GetConsumables(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteConsumables", p);
        }

        public DataTable GetMachineries(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteMachineries", p);
        }

        public DataTable GetBranchHrs(int dailySiteCode)
        {
            var p = new[] { SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteBranchHrs", p);
        }

        public string GenerateDocNo(DateTime docDate)
        {
            var p = new[] { SqlHelper.Param("@DocDate", SqlDbType.DateTime, docDate) };
            return _db.DataTransactionsByProcedure("usp_GenerateDailySiteNo", p);
        }

        public DataTable GetRevisionNo(string jobNo)
        {
            var p = new[] { SqlHelper.Param("@JobNo", SqlDbType.VarChar, jobNo, 8000) };
            return _db.GetDataTableFromProcedure("usp_GetDailySiteRevisionNo", p);
        }

        public DataSet GetSalesOrderDetails(int soCode, decimal basic, int dailySiteCode, int itemCode, DateTime docDate)
        {
            var p = new[]
            {
                SqlHelper.Param("@SOCode", SqlDbType.Int, soCode),
                SqlHelper.Param("@Basic", SqlDbType.Decimal, basic),
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, dailySiteCode),
                SqlHelper.Param("@ItemCode", SqlDbType.Int, itemCode),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, docDate)
            };
            return _db.GetDataSetFromProcedure("usp_GetDailySiteSOWise", p);
        }

        public DataTable GetSalesOrders()
        {
            return _db.GetDataTableFromProcedure("usp_GetDailySiteSalesOrderNo");
        }

        public DataTable GetScopePreparations() => _db.GetDataTableFromQuery(
            "select SurfacePreparationCode,SurfacePreparationName from SalesSurfacePreparationInfo");

        public DataTable GetUnits() => _db.GetDataTableFromQuery(
            "select UnitCode as Uom,UnitCode,UnitDesc from AdminUnitInfo order by UnitDesc");

        public DataTable GetMaterials() => _db.GetDataTableFromQuery(
            "select ItemCode as MaterialCode,Description as MaterialName from AdminItemInfo order by ItemName");

        public DataTable GetEmployees() => _db.GetDataTableFromQuery(
            "select EmployeeCode,EmpFullName from payrollEmployeeInfo where ActiveYesNo='Y' and (isnull(CategoryCode,0)=12 or isnull(CategoryCode,0)=13 or isnull(CategoryCode,0)=14)");

        public DataTable GetConsumables() => _db.GetDataTableFromQuery(
            "select * from SalesConsumableInfo where isnull(Description,'')!=''");

        public DataTable GetMachineries() => _db.GetDataTableFromQuery(
            "select ToolsAndEquipmentCode,Description + ' - ' + AssetCode as Description from SalesToolsAndEquipmentinfo where isnull(Description,'')!=''");

        public DataTable GetMachineryStatuses() => _db.GetDataTableFromQuery(
            "select 1 as StatusCode,'Hire' as StatusName union all select 2 as StatusCode,'Inhouse' as StatusName");

        public DataTable GetCustomers()
        {
            var p = new[]
            {
                SqlHelper.Param("@SearchText", SqlDbType.VarChar, "", 500),
                SqlHelper.Param("@SearchCriteria", SqlDbType.VarChar, "", 500)
            };
            return _db.GetDataTableFromProcedure("usp_Sales_GetCustomers", p);
        }

        public DataTable GetExistingSalesOrders(int soCode)
        {
            const string sql = "select * from SalesOrderNew where SoNo like '%' + (select LTRIM(RTRIM(CASE WHEN SONo LIKE '%REV%' THEN LEFT(SONo, PATINDEX('%[ -]REV%', SONo) - 1) ELSE SONo END)) from SalesOrderNew where SoCode=@SoCode) + '%' and SoCode != @SoCode and SoCode in (select JobCode from DailySiteHdr)";
            return _db.GetDataTableFromQuery(sql, new[] { SqlHelper.Param("@SoCode", SqlDbType.Int, soCode) });
        }

        /// <summary>
        /// Calls usp_ManageDailySite - same SP used for insert (Mode 0), update (Mode 1) and delete (Mode 2)
        /// by the desktop app. Table-valued rows must match the exact columns of the SQL Server
        /// user-defined table types (ERP_UDT_DailySiteScopeOfWork etc.) - see the TODO in DailySiteModels.cs.
        /// </summary>
        public string Save(DailySiteSaveRequest req, int branchCode, int periodId, int userCode)
        {
            DataTable dtScopeOfWork = ToDataTable(req.ScopeOfWork);
            DataTable dtMaterial = ToDataTable(req.Material);
            DataTable dtConsumablesAndMachineries = ToDataTable(req.ConsumablesAndMachineries);
            DataTable dtConsumables = ToDataTable(req.Consumables);
            DataTable dtMachineries = ToDataTable(req.Machineries);
            DataTable dtConsumablesDR = ToDataTable(req.ConsumablesDR);
            DataTable dtBranchHrs = ToDataTable(req.BranchHrs);

            var p = new[]
            {
                SqlHelper.Param("@DailySiteCode", SqlDbType.Int, req.DailySiteCode),
                SqlHelper.Param("@DocNo", SqlDbType.VarChar, req.DocNo, 8000),
                SqlHelper.Param("@DocNoRev", SqlDbType.VarChar, req.DocNoRev, 8000),
                SqlHelper.Param("@DocDate", SqlDbType.DateTime, req.DocDate),
                SqlHelper.Param("@ClientCode", SqlDbType.Int, req.ClientCode),
                SqlHelper.Param("@JobCode", SqlDbType.Int, req.JobCode),
                SqlHelper.Param("@StartDate", SqlDbType.DateTime, req.StartDate),
                SqlHelper.Param("@FinishDate", SqlDbType.DateTime, req.FinishDate),
                SqlHelper.Param("@Location", SqlDbType.VarChar, req.Location, 8000),
                SqlHelper.Param("@Project", SqlDbType.VarChar, req.Project, 8000),
                SqlHelper.Param("@StartTime", SqlDbType.DateTime, req.StartTime),
                SqlHelper.Param("@CloseTime", SqlDbType.DateTime, req.CloseTime),
                SqlHelper.Param("@Supervisor", SqlDbType.Int, req.Supervisor),
                SqlHelper.Param("@PreparedBy", SqlDbType.Int, req.PreparedBy),
                SqlHelper.Param("@Engineer", SqlDbType.Int, req.Engineer),
                SqlHelper.Param("@ScopeOfWorkCode", SqlDbType.VarChar, req.ScopeOfWorkCode, 8000),
                SqlHelper.TableParam("@dtScopeOfWork", "ERP_UDT_DailySiteScopeOfWork", dtScopeOfWork),
                SqlHelper.TableParam("@dtMaterial", "ERP_UDT_DailySiteMaterial", dtMaterial),
                SqlHelper.TableParam("@dtConsumablesAndMachineries", "ERP_UDT_DailySiteConsumablesAndMachineriesNew", dtConsumablesAndMachineries),
                SqlHelper.Param("@ScopeManhours", SqlDbType.Decimal, req.ScopeManhours),
                SqlHelper.Param("@TodayManhours", SqlDbType.Decimal, req.TodayManhours),
                SqlHelper.Param("@PreviousManhours", SqlDbType.Decimal, req.PreviousManhours),
                SqlHelper.Param("@GrandTotalManhours", SqlDbType.Decimal, req.GrandTotalManhours),
                SqlHelper.Param("@BalanceManhours", SqlDbType.Decimal, req.BalanceManhours),
                SqlHelper.Param("@BranchCode", SqlDbType.Int, branchCode),
                SqlHelper.Param("@PeriodId", SqlDbType.Int, periodId),
                SqlHelper.Param("@UserCode", SqlDbType.Int, userCode),
                SqlHelper.Param("@Mode", SqlDbType.Int, req.Mode),
                SqlHelper.Param("@Excess", SqlDbType.VarChar, req.Excess, 8000),
                SqlHelper.Param("@Remarks", SqlDbType.VarChar, req.Remarks, 8000),
                SqlHelper.Param("@MinHrs", SqlDbType.VarChar, req.MinHrs, 8000),
                SqlHelper.TableParam("@dtConsumables", "ERP_UDT_DailySiteConsumablesAndMachineriesNew", dtConsumables),
                SqlHelper.TableParam("@dtMachineries", "ERP_UDT_DailySiteConsumablesAndMachineriesNew", dtMachineries),
                SqlHelper.TableParam("@dtBranchHrs", "ERP_UDT_DailySiteConsumablesAndMachineriesNew", dtBranchHrs),
                SqlHelper.Param("@TodayManhoursPerc", SqlDbType.Decimal, req.TodayManhoursPerc),
                SqlHelper.Param("@PreviousManhoursPerc", SqlDbType.Decimal, req.PreviousManhoursPerc),
                SqlHelper.Param("@GrandTotalManhoursPerc", SqlDbType.Decimal, req.GrandTotalManhoursPerc),
                SqlHelper.Param("@BalanceManhoursPerc", SqlDbType.Decimal, req.BalanceManhoursPerc),
                SqlHelper.Param("@ExcessPerc", SqlDbType.Decimal, req.ExcessPerc),
                SqlHelper.Param("@WithoutMaterial", SqlDbType.VarChar, req.WithoutMaterial, 8000),
                SqlHelper.TableParam("@dtConsumablesDR", "ERP_UDT_DailySiteConsumablesAndMachineriesNew", dtConsumablesDR),
                SqlHelper.Param("@ExsistSoCode", SqlDbType.Int, req.ExsistSoCode)
            };

            return _db.DataTransactionsByProcedure("usp_ManageDailySite", p);
        }

        // Builds a DataTable from a list of strongly-typed rows (ScopeOfWorkRow, MaterialRow,
        // ConsumableMachineryRow) using reflection over their public properties, so the
        // resulting DataTable's columns line up with the SQL Server user-defined table type.
        // Verify the column order/names against the real ERP_UDT_* types in SSMS before go-live.
        private static DataTable ToDataTable<T>(List<T> rows)
        {
            var dt = new DataTable();
            var props = typeof(T).GetProperties();
            foreach (var prop in props)
                dt.Columns.Add(prop.Name, Nullable.GetUnderlyingType(prop.PropertyType) ?? prop.PropertyType);

            foreach (var row in rows)
            {
                var dr = dt.NewRow();
                foreach (var prop in props)
                    dr[prop.Name] = prop.GetValue(row) ?? DBNull.Value;
                dt.Rows.Add(dr);
            }
            return dt;
        }

        // Fallback for the generic BranchHrs rows (still dictionary-based - its UDT columns
        // weren't visible in the files provided, fill in a BranchHrsRow class the same way
        // once you confirm them).
        private static DataTable ToDataTable(List<Dictionary<string, object>> rows)
        {
            var dt = new DataTable();
            if (rows.Count == 0) return dt;

            foreach (var key in rows[0].Keys)
                dt.Columns.Add(key);

            foreach (var row in rows)
            {
                var dr = dt.NewRow();
                foreach (var kv in row)
                    dr[kv.Key] = kv.Value ?? DBNull.Value;
                dt.Rows.Add(dr);
            }
            return dt;
        }
    }
}
